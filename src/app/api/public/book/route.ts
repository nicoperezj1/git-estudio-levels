import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendBookingConfirmation } from "@/lib/resend";
import { tryConsumeQuota } from "@/lib/message-quota";

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { serviceIds, serviceId, barberId, date, startTime, clientName, clientEmail, clientPhone, notes } = body;

  // Support both single serviceId and array serviceIds
  const ids: string[] = serviceIds || (serviceId ? [serviceId] : []);

  // Validate required fields
  if (ids.length === 0 || !barberId || !date || !startTime || !clientName) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Get services details
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, duration")
    .in("id", ids);

  if (!services || services.length === 0) {
    return NextResponse.json({ error: "Servicios no encontrados" }, { status: 404 });
  }

  // Check for custom barber prices
  const { data: customPrices } = await supabase
    .from("barber_services")
    .select("service_id, custom_price, custom_duration")
    .eq("barber_id", barberId)
    .in("service_id", ids);

  const customMap = new Map((customPrices || []).map((c) => [c.service_id, c]));

  // Apply custom prices/durations
  const resolvedServices = services.map((s) => {
    const custom = customMap.get(s.id);
    return {
      ...s,
      price: custom?.custom_price ? Number(custom.custom_price) : Number(s.price),
      duration: custom?.custom_duration || s.duration,
    };
  });

  const totalDuration = resolvedServices.reduce((sum, s) => sum + s.duration, 0);
  const totalPrice = resolvedServices.reduce((sum, s) => sum + s.price, 0);
  const serviceNames = resolvedServices.map((s) => s.name).join(" + ");

  // Calculate end time
  const start = new Date(startTime);
  const end = new Date(start.getTime() + totalDuration * 60000);

  // Check for conflicts (double booking prevention)
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .eq("barber_id", barberId)
    .eq("date", date)
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString());

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Horario no disponible. Selecciona otro." }, { status: 409 });
  }

  // Find or create client
  // Get tenant_id from barber
  const { data: barberData } = await supabase.from("profiles").select("tenant_id").eq("id", barberId).single();
  const tenantId = barberData?.tenant_id || null;

  let clientId: string;
  if (clientEmail) {
    // Reuse an existing client with this email in this business. Was using .single(),
    // which errored (treated as "not found") when duplicates already existed, so every
    // booking created another duplicate. limit(1)+maybeSingle reuses the existing one.
    let dupQuery = supabase
      .from("clients")
      .select("id")
      .eq("email", clientEmail);
    if (tenantId) dupQuery = dupQuery.eq("tenant_id", tenantId);
    const { data: existingClient } = await dupQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
      // Update phone if provided
      if (clientPhone) {
        await supabase.from("clients").update({ phone: clientPhone }).eq("id", clientId);
      }
    } else {
      // Punto 10 (Pablo): cliente nuevo que se creo solo reservando por link -> origen "link".
      // Solo se marca al CREAR el cliente; uno que ya existia conserva su origen original.
      const { data: newClient } = await supabase
        .from("clients")
        .insert({ name: clientName, email: clientEmail, phone: clientPhone || null, tenant_id: tenantId, acquisition_source: "link" })
        .select("id")
        .single();
      clientId = newClient!.id;
    }
  } else {
    const { data: newClient } = await supabase
      .from("clients")
      .insert({ name: clientName, phone: clientPhone || null, tenant_id: tenantId, acquisition_source: "link" })
      .select("id")
      .single();
    clientId = newClient!.id;
  }

  // Create appointment
  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      client_id: clientId,
      barber_id: barberId,
      date,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled",
      notes: notes || null,
      tenant_id: tenantId,
      source: "link", // Punto 10: reserva hecha por el cliente desde el link publico.
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Error creando la cita" }, { status: 500 });
  }

  // Add services to appointment
  const serviceInserts = resolvedServices.map((s) => ({
    appointment_id: appointment!.id,
    service_id: s.id,
    price: s.price,
  }));
  await supabase.from("appointment_services").insert(serviceInserts);

  // Get barber name + email (name for the client's email, email to notify the barber).
  const { data: barber } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", barberId)
    .single();

  // Business logo for the confirmation email (so it shows the salon's brand, not the
  // generic re-booking logo).
  let businessLogoUrl: string | null = null;
  if (tenantId) {
    const { data: tenantRow } = await supabase.from("tenants").select("logo_url").eq("id", tenantId).single();
    businessLogoUrl = tenantRow?.logo_url || null;
  }

  // Send confirmation email (non-blocking). Cuenta contra el cupo de correos del negocio
  // (Nico, 27-sep: confirmaciones si cuentan) — si ya lo agoto, no se envia.
  if (clientEmail) {
    try {
      const allowed = !tenantId || (await tryConsumeQuota(tenantId, "email", "confirmation"));
      if (allowed) {
        await sendBookingConfirmation({
          to: clientEmail,
          clientName,
          barberName: barber?.name || "Tu profesional",
          serviceName: serviceNames,
          date: start,
          duration: totalDuration,
          price: totalPrice,
          appointmentId: appointment!.id,
          businessLogoUrl,
        });
      } else {
        console.warn(`Cupo de correos agotado para tenant ${tenantId}, no se envia confirmacion a ${clientEmail}`);
      }
    } catch (e) {
      console.error("Error sending confirmation email:", e);
    }
  }

  // Notify the assigned barber AND the business's reception/admins by push. The old
  // call passed no recipient, so /api/push/send rejected it and nobody was notified.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";
  try {
    await fetch(`${appUrl}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: barberId, // the professional who got the appointment
        tenantId, // + reception/admins of this business
        roles: ["admin", "receptionist"],
        title: "Nueva Cita Agendada",
        body: `${clientName} - ${serviceNames} con ${barber?.name || "Profesional"} (${start.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })})`,
        url: "/dashboard/agenda",
        tag: "new-appointment",
      }),
    });
  } catch (e) {
    console.error("Error sending push:", e);
  }

  // Also email the barber (reliable channel, works without browser notifications).
  if (barber?.email) {
    try {
      const { sendBarberNewAppointment } = await import("@/lib/resend");
      await sendBarberNewAppointment({
        to: barber.email,
        barberName: barber.name || "Profesional",
        clientName,
        serviceName: serviceNames,
        date: start,
      });
    } catch (e) {
      console.error("Error emailing barber (public booking):", e);
    }
  }

  return NextResponse.json({
    success: true,
    appointmentId: appointment!.id,
    message: "Cita agendada exitosamente",
  });
}
