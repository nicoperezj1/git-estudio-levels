import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { recommendShares } from "@/lib/booking-rules";
import { serviceSalesByPro, previousMonthStart } from "@/lib/booking-sales";
import { monthLabelEs } from "@/lib/accounting";
import { todayInChile } from "@/lib/utils";

// "Recomendado por estadisticas": propone % segun las ventas de servicios del MES ANTERIOR, potenciando
// al que vendio menos (minimo 10%, maximo 60%; un profesional nuevo recibe el promedio). Solo propone,
// no guarda nada: el administrador decide.
export async function GET() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const first = previousMonthStart(todayInChile());
  const { data: pros } = await supabase.from("profiles").select("id, name, role, also_attends_clients, created_at")
    .eq("tenant_id", c.tenantId).eq("active", true).in("role", ["barber", "admin"]);
  const team = (pros || []).filter((p: any) => p.role === "barber" || p.also_attends_clients);
  if (team.length < 2) return NextResponse.json({ error: "Hacen falta al menos 2 profesionales." }, { status: 409 });

  const sales = await serviceSalesByPro(supabase, c.tenantId, first);
  const bySales: Record<string, number> = {};
  const newIds: string[] = [];
  for (const p of team as any[]) {
    bySales[p.id] = Math.round(sales[p.id] || 0);
    if (!(p.id in sales)) newIds.push(p.id); // sin ventas el mes pasado = nuevo (o no vendio nada)
  }
  const recommended = recommendShares(bySales, newIds);
  return NextResponse.json({
    monthLabel: monthLabelEs(first), recommended,
    sales: bySales, newIds, names: Object.fromEntries((team as any[]).map((p) => [p.id, p.name])),
  });
}
