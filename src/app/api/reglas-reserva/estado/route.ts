import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { effectiveTargets, getRuleConfig, weekRange, weeklyAutoCounts } from "@/lib/booking-rules";
import { todayInChile } from "@/lib/utils";

// Para la tarjeta del Dashboard (solo administrador): cumplimiento semanal de las metas, cuantas
// reservas automaticas hubo y si hay una recomendacion nueva al empezar el mes. Solo cuando el negocio
// usa la regla 3 (% por profesional); con otra regla no muestra nada.
export async function GET() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return NextResponse.json({ active: false });
  const supabase = createAdminSupabase();
  const cfg = await getRuleConfig(supabase, c.tenantId);
  if (cfg.rule !== "target_share") return NextResponse.json({ active: false });

  const today = todayInChile();
  const { data: pros } = await supabase.from("profiles").select("id, name, role, also_attends_clients")
    .eq("tenant_id", c.tenantId).eq("active", true).in("role", ["barber", "admin"]);
  const team = (pros || []).filter((p: any) => p.role === "barber" || p.also_attends_clients) as any[];
  const counts = await weeklyAutoCounts(supabase, c.tenantId, today);
  const total = team.reduce((s, p) => s + (counts[p.id] || 0), 0);
  const eff = effectiveTargets(team.map((p) => p.id), cfg.targets);

  const { data: t } = await supabase.from("tenants").select("booking_reco_month").eq("id", c.tenantId).maybeSingle();
  const seen = (t as any)?.booking_reco_month || null;
  const month = today.slice(0, 7);
  return NextResponse.json({
    active: true,
    week: weekRange(today),
    autoTotal: total,
    pros: team.map((p) => ({
      id: p.id, name: p.name, target: Math.round(eff[p.id] ?? 0),
      actual: total > 0 ? Math.round(((counts[p.id] || 0) / total) * 100) : 0, count: counts[p.id] || 0,
    })),
    // Aviso al empezar el mes: hay recomendacion nueva si aun no se vio la de este mes.
    newRecommendation: seen !== month,
  });
}
