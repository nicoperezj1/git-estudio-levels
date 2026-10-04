import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { getSlotCapacity, isSlotFull } from "@/lib/capacity";
import { parseWallClock } from "@/lib/wallclock";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // SEGURIDAD: antes no pedia sesion: cualquiera podia cancelar o mover citas de cualquier negocio.
  const session = await getCurrentUserRoleAndTenant();
  if (!session.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();
  const { data: before } = await supabase.from("appointments")
    .select("tenant_id, barber_id, status, date, start_time, client:clients(name)").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  if (session.role !== "super_admin" && (before as any).tenant_id !== session.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json();
  // Si cambia de profesional, el nuevo debe ser del mismo negocio.
  if (body.barber_id && body.barber_id !== (before as any).barber_id && session.role !== "super_admin") {
    const { data: nb } = await supabase.from("profiles").select("tenant_id").eq("id", body.barber_id).maybeSingle();
    if (nb?.tenant_id !== session.tenantId) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  // Build update object dynamically
  const update: Record<string, any> = {};
  if (body.status) update.status = body.status;
  if (body.barber_id) update.barber_id = body.barber_id;
  if (body.start_time) update.start_time = body.start_time;
  if (body.end_time) update.end_time = body.end_time;
  if (body.date) update.date = body.date;
  if (body.notes !== undefined) update.notes = body.notes;

  // Cambiar los servicios de la cita (Nico, 29-sep): reemplaza appointment_services con los
  // servicios elegidos (precio tomado del catalogo) y, si adjust_end, recalcula la hora de
  // termino segun la duracion total nueva.
  if (Array.isArray(body.service_ids) && body.service_ids.length > 0) {
    const { data: svcs, error: svcErr } = await supabase
      .from("services")
      .select("id, price, duration")
      .in("id", body.service_ids);
    if (svcErr || !svcs || svcs.length === 0) {
      return NextResponse.json({ error: "Servicios no encontrados" }, { status: 400 });
    }
    const { error: delErr } = await supabase.from("appointment_services").delete().eq("appointment_id", params.id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await supabase
      .from("appointment_services")
      .insert(svcs.map((sv: any) => ({ appointment_id: params.id, service_id: sv.id, price: sv.price })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    if (body.adjust_end && !body.end_time) {
      const { data: cur } = await supabase.from("appointments").select("start_time").eq("id", params.id).single();
      const startIso = body.start_time || cur?.start_time;
      if (startIso) {
        const total = svcs.reduce((n: number, sv: any) => n + (sv.duration || 0), 0);
        update.end_time = new Date(new Date(startIso).getTime() + total * 60000).toISOString();
      }
    }
  }

  // Cupos por bloque (solo kinesiologia): mover una cita a un horario/profesional ya lleno no se
  // permite. Con cupo 1 (todos los demas rubros) no se comprueba nada, igual que siempre.
  if (update.start_time || update.end_time || update.barber_id) {
    const { data: cur } = await supabase.from("appointments").select("barber_id, date, start_time, end_time, tenant_id").eq("id", params.id).single();
    if (cur) {
      const barber = update.barber_id || cur.barber_id;
      if (await getSlotCapacity(supabase, cur.tenant_id) > 1) {
        const start = parseWallClock(update.start_time || cur.start_time);
        const end = parseWallClock(update.end_time || cur.end_time);
        if (await isSlotFull(supabase, barber, cur.tenant_id, update.date || cur.date, start, end, params.id)) {
          return NextResponse.json({ error: "Ese horario ya no tiene cupo" }, { status: 409 });
        }
      }
    }
  }

  if (Object.keys(update).length === 0) {
    const { data: same, error: sameErr } = await supabase.from("appointments").select().eq("id", params.id).single();
    if (sameErr) return NextResponse.json({ error: sameErr.message }, { status: 500 });
    return NextResponse.json(same);
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aviso al profesional si le cancelan o le cambian la hora de una cita (quien lo hizo no se avisa a si mismo).
  try {
    const b: any = before;
    const cancelled = update.status && ["cancelled", "no_show"].includes(update.status) && update.status !== b.status;
    const moved = (update.start_time && update.start_time !== b.start_time) || (update.date && update.date !== b.date);
    if (b.barber_id && (cancelled || moved)) {
      const hhmm = String((update.start_time || b.start_time) || "").match(/(\d{2}:\d{2})/)?.[1] || "";
      const who = b.client?.name || "Cliente";
      await notify({
        tenantId: b.tenant_id, kind: "appointment_changed", userIds: [b.barber_id],
        title: cancelled ? "Cita cancelada" : "Cita cambiada de hora",
        body: `${who}${hhmm ? ` - ${hhmm}` : ""}`, url: "/dashboard/mi-agenda", createdBy: session.userId,
      });
    }
  } catch (e) {
    console.error("aviso de cambio de cita:", e);
  }
  return NextResponse.json(data);
}
