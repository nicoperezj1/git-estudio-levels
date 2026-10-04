import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase, resolveTenantForRequest, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { newClientAppointmentIds } from "@/lib/new-client";
import { isSlotFull, exceededAfterInsert, getSlotCapacity } from "@/lib/capacity";
import { parseWallClock } from "@/lib/wallclock";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  // Item (Nico, 28-sep): vista de calendario por profesional a 1/3/7 dias — necesita
  // traer varios dias en una sola consulta en vez de una por dia. `date` sigue funcionando
  // igual que siempre (match exacto) cuando no se manda un rango.
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const barberId = searchParams.get("barberId");
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  let query = supabase
    .from("appointments")
    .select(`
      *,
      client:clients(id, name, phone),
      barber:profiles(id, name),
      services:appointment_services(
        id, price,
        service:services(name, price, duration)
      )
    `)
    .order("start_time", { ascending: true });

  if (tenantId && tenantId !== "ALL") query = query.eq("tenant_id", tenantId);
  if (date) query = query.eq("date", date);
  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  if (barberId) query = query.eq("barber_id", barberId);

  const { data, error } = await query;
  if (error) return NextResponse.json([]);
  const rows: any[] = data || [];

  // Distintivo "Nuevo" del calendario: primera cita del cliente, o cita sin ficha de cliente
  // vinculada. Ver src/lib/new-client.ts.
  const newIds = await newClientAppointmentIds(supabase, rows);
  for (const r of rows) r.is_new_client = newIds.has(r.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion y tomaba el negocio del cuerpo: cualquiera creaba citas en cualquier negocio.
  const session = await getCurrentUserRoleAndTenant();
  if (!session.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { clientId, barberId, date, startTime, endTime: customEndTime, serviceIds, notes } = body;

  // El negocio sale del profesional, y debe ser el de quien crea la cita (super_admin con cualquiera).
  const { data: barberProfile } = await supabase.from("profiles").select("tenant_id").eq("id", barberId).single();
  const resolvedTenantId = barberProfile?.tenant_id || null;
  if (!barberProfile) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  if (session.role !== "super_admin" && resolvedTenantId !== session.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Get services to calculate duration (if no custom end time). name is used for the
  // barber's new-appointment email.
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, duration")
    .in("id", serviceIds);

  if (!services || services.length === 0) {
    return NextResponse.json({ error: "Servicios no encontrados" }, { status: 400 });
  }

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const start = parseWallClock(startTime);
  // Use custom end time if provided, otherwise calculate from service duration
  const end = customEndTime ? parseWallClock(customEndTime) : new Date(start.getTime() + totalDuration * 60000);

  // Check conflicts (con "cupos por bloque", solo kinesiologia, se admiten varias citas hasta el cupo)
  if (await isSlotFull(supabase, barberId, resolvedTenantId, date, start, end)) {
    const cap = await getSlotCapacity(supabase, resolvedTenantId);
    return NextResponse.json(
      { error: cap > 1 ? `Horario lleno: ya hay ${cap} clientes (cupo máximo)` : "El profesional tiene una cita en ese horario" },
      { status: 409 }
    );
  }

  // Create appointment. client_id may be null (reception holding a slot without a
  // client yet) — explicit ?? null so an undefined doesn't turn into a NOT-NULL error.
  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      client_id: clientId ?? null,
      barber_id: barberId,
      date,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled",
      notes: notes ?? null,
      tenant_id: resolvedTenantId,
      source: "manual", // Punto 10: creada por el equipo desde el dashboard (no por el cliente).
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dos personas pueden tomar el ultimo cupo a la vez: si nos pasamos, esta cita se deshace.
  if (await exceededAfterInsert(supabase, barberId, resolvedTenantId, date, start, end)) {
    await supabase.from("appointments").delete().eq("id", appointment.id);
    return NextResponse.json({ error: "El profesional ya no tiene cupo en ese horario" }, { status: 409 });
  }

  // Add services (surface a failure instead of silently losing them)
  const serviceInserts = services.map((s) => ({
    appointment_id: appointment.id,
    service_id: s.id,
    price: s.price,
  }));

  const { error: svcError } = await supabase.from("appointment_services").insert(serviceInserts);
  if (svcError) {
    // Roll back the orphan appointment so we don't leave a cita with no services.
    await supabase.from("appointments").delete().eq("id", appointment.id);
    return NextResponse.json({ error: `No se pudieron agregar los servicios: ${svcError.message}` }, { status: 500 });
  }

  // Notify the assigned professional that a new appointment was booked for them (e.g.
  // reception created it) — by push AND by email. Email is the reliable channel: it
  // arrives even if the barber never enabled browser notifications. Non-blocking.
  try {
    const [{ data: barber }, { data: client }] = await Promise.all([
      supabase.from("profiles").select("name, email").eq("id", barberId).single(),
      clientId ? supabase.from("clients").select("name").eq("id", clientId).single() : Promise.resolve({ data: null }),
    ]);
    await notify({
      tenantId: resolvedTenantId, kind: "appointment_new", userIds: [barberId],
      title: "Nueva Cita Agendada",
      body: `${client?.name || "Cliente"} - ${start.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`,
      url: "/dashboard/mi-agenda",
    });
    if (barber?.email) {
      const { sendBarberNewAppointment } = await import("@/lib/resend");
      const serviceNames = services.map((s: any) => s.name || "Servicio").join(" + ");
      await sendBarberNewAppointment({
        to: barber.email,
        barberName: barber.name || "Profesional",
        clientName: client?.name || "Cliente",
        serviceName: serviceNames,
        date: start,
      });
    }
  } catch (e) {
    console.error("Error notifying barber (dashboard booking):", e);
  }

  return NextResponse.json(appointment, { status: 201 });
}
