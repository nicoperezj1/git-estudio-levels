import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// GET ?barberId=: servicios que ese profesional ofrece, del mas pedido al menos pedido.
// Lo usa el calendario (Agendar). Si el profesional no tiene servicios asignados se devuelven todos
// (igual que la reserva online). El Punto de Venta sigue usando /api/services con todos.
export async function GET(req: NextRequest) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const barberId = new URL(req.url).searchParams.get("barberId");
  if (!barberId) return NextResponse.json({ error: "barberId requerido" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: barber } = await supabase.from("profiles").select("tenant_id").eq("id", barberId).maybeSingle();
  if (!barber || (role !== "super_admin" && barber.tenant_id !== tenantId)) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  const [{ data: services }, { data: assigned }, { data: used }] = await Promise.all([
    supabase.from("services").select("*").eq("tenant_id", barber.tenant_id).eq("active", true).order("sort_order"),
    supabase.from("barber_service_assignments").select("service_id").eq("barber_id", barberId),
    supabase
      .from("appointment_services")
      .select("service_id, appointments!inner(barber_id, status)")
      .eq("appointments.barber_id", barberId)
      .neq("appointments.status", "cancelled")
      .limit(5000),
  ]);

  const assignedIds = new Set((assigned || []).map((a: any) => a.service_id));
  const counts = new Map<string, number>();
  for (const u of used || []) counts.set((u as any).service_id, (counts.get((u as any).service_id) || 0) + 1);

  const list = (services || [])
    .filter((s: any) => assignedIds.size === 0 || assignedIds.has(s.id))
    .map((s: any, i: number) => ({ s, i }))
    .sort((a, b) => (counts.get(b.s.id) || 0) - (counts.get(a.s.id) || 0) || a.i - b.i)
    .map(({ s }) => s);

  return NextResponse.json(list);
}
