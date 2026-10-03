import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

// POST: Notify barber that their client has arrived
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion (cualquiera podia mandarle avisos a un profesional). Ahora solo recepcion/admin
  // y la cita debe ser de su negocio.
  const { ok, role, tenantId } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { appointmentId, clientName, barberName } = await req.json();

  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId required" }, { status: 400 });
  }

  // Get appointment details to find the barber
  const { data: appt } = await supabase
    .from("appointments")
    .select("barber_id, start_time, tenant_id")
    .eq("id", appointmentId)
    .single();

  if (!appt?.barber_id) {
    return NextResponse.json({ error: "Cita sin profesional asignado" }, { status: 400 });
  }
  if (role !== "super_admin" && appt.tenant_id !== tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Send real push notification to barber
  try {
    await sendPush({
      userId: appt.barber_id,
      title: "Tu cliente llego!",
      body: `${clientName} esta esperando.`,
      url: "/dashboard/mi-agenda",
    });
  } catch (e) {
    console.error("Error sending push:", e);
  }

  // Store notification in audit log
  await supabase.from("audit_log").insert({
    action: "client_arrived",
    entity_type: "appointment",
    entity_id: appointmentId,
    description: `${clientName} llego para su cita con ${barberName}`,
    user_id: appt.barber_id,
    user_name: barberName,
    metadata: { clientName, appointmentId, barberName },
  });

  return NextResponse.json({ success: true, notified: barberName });
}
