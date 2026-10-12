import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

// POST: Cancel an appointment by ID (public, no auth needed - uses appointment ID as token)
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { appointmentId } = await req.json();

  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId requerido" }, { status: 400 });
  }

  // Get appointment
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, status, date, start_time, client_id, barber_id, tenant_id, client:clients(name)")
    .eq("id", appointmentId)
    .single();

  if (!appt) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  // Only allow cancellation of scheduled/confirmed appointments
  if (!["scheduled", "confirmed"].includes(appt.status)) {
    return NextResponse.json({ error: "Esta cita ya no puede ser cancelada" }, { status: 400 });
  }

  // Check if it's not too late (at least 2 hours before)
  const apptTime = new Date(appt.start_time);
  const now = new Date();
  const hoursUntil = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < 2) {
    return NextResponse.json({ error: "No se puede cancelar con menos de 2 horas de anticipacion" }, { status: 400 });
  }

  // Cancel the appointment
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: "Error al cancelar" }, { status: 500 });
  }

  // Aviso al profesional (y recepcion/admin) de que el cliente cancelo. Nunca rompe la cancelacion.
  try {
    const a: any = appt;
    const hhmm = String(a.start_time || "").match(/(\d{2}:\d{2})/)?.[1] || "";
    const who = (Array.isArray(a.client) ? a.client[0]?.name : a.client?.name) || "Un cliente";
    await notify({
      tenantId: a.tenant_id, kind: "appointment_changed",
      userIds: a.barber_id ? [a.barber_id] : [], roles: ["admin", "receptionist"],
      title: "😕 Se canceló una cita",
      body: `${who} canceló${hhmm ? ` su hora de las ${hhmm}` : " su cita"}. El espacio quedó libre.`,
      url: "/dashboard/mi-agenda",
    });
  } catch (e) {
    console.error("aviso de cancelacion:", e);
  }

  return NextResponse.json({ success: true, message: "Cita cancelada exitosamente" });
}
