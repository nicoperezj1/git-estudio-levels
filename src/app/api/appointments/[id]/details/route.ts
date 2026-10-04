import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { newClientAppointmentIds } from "@/lib/new-client";

// GET: Full appointment details for calendar popup
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // SEGURIDAD: antes no pedia sesion y devolvia datos del cliente de cualquier cita.
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();

  // Get appointment with relations
  const { data: appt } = await supabase
    .from("appointments")
    .select(`
      id, client_id, tenant_id, date, start_time, end_time, status, notes, created_at,
      client:clients(id, name, email, phone, loyalty_points, created_at),
      barber:profiles(id, name, avatar_url),
      services:appointment_services(price, service:services(id, name, duration))
    `)
    .eq("id", params.id)
    .single();

  if (!appt || (role !== "super_admin" && (appt as any).tenant_id !== tenantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check if client is new (first appointment)
  const client = appt.client as any;
  // "Nuevo" = primera cita del cliente, o sin ficha vinculada (mismo criterio que el calendario).
  const isNewClient = (await newClientAppointmentIds(supabase, [{ id: appt.id, client_id: (appt as any).client_id, date: appt.date, start_time: appt.start_time }])).has(appt.id);
  let totalVisits = 0;
  let lastServices: string[] = [];

  if (client?.id) {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id)
      .eq("status", "completed");

    totalVisits = count || 0;

    // Last 3 services
    const { data: history } = await supabase
      .from("appointments")
      .select("date, services:appointment_services(service:services(name))")
      .eq("client_id", client.id)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(3);

    lastServices = (history || []).map((h: any) =>
      (h.services || []).map((s: any) => s.service?.name).join(" + ")
    );
  }

  return NextResponse.json({
    ...appt,
    isNewClient,
    totalVisits,
    lastServices,
  });
}
