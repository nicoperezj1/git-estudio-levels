import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile, chileDayBoundsUtc } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Dashboard del Super Admin: vista de TODA la plataforma (empresas, planes, ciudades,
// ingresos de re-booking y volumen que mueven los negocios). Solo super_admin.

const PAGE = 1000;
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: any[] | null }>): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function GET() {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminSupabase();

  const [chileYear, chileMonth] = todayInChile().split("-").map(Number);
  const range = (y: number, m: number) => {
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
    return { startUtc: chileDayBoundsUtc(first).startUtc, endUtc: chileDayBoundsUtc(last).endUtc, first, last };
  };
  const cur = range(chileYear, chileMonth);
  const prev = chileMonth === 1 ? range(chileYear - 1, 12) : range(chileYear, chileMonth - 1);

  // Empresas + suscripcion + precios de plan.
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, name, slug, plan, status, active, city, business_category, trial_ends_at, created_at, subscription:subscriptions(plan, status, amount, payment_gateway, cancelled_at)");
  const tenants: any[] = tenantRows || [];
  const { data: planRows } = await supabase.from("plan_limits").select("plan, name, price_clp");
  const planPrice: Record<string, number> = {};
  const planName: Record<string, string> = {};
  for (const p of planRows || []) { planPrice[p.plan] = Number(p.price_clp) || 0; planName[p.plan] = p.name; }

  const now = Date.now();
  const startCur = new Date(cur.startUtc).getTime();
  const startPrev = new Date(prev.startUtc).getTime();

  const sub = (t: any) => (Array.isArray(t.subscription) ? t.subscription[0] : t.subscription) || null;
  const monthly = (t: any) => {
    const s = sub(t);
    const amt = s?.amount != null && Number(s.amount) > 0 ? Number(s.amount) : planPrice[t.plan] || 0;
    return amt;
  };

  const byStatus: Record<string, number> = {};
  const byPlan: Record<string, { count: number; active: number; mrr: number }> = {};
  const byCity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byGateway: Record<string, { count: number; mrr: number }> = {};
  let mrr = 0;
  let newThisMonth = 0;
  let newPrevMonth = 0;
  let cancelledThisMonth = 0;
  const trialsEnding: any[] = [];

  for (const t of tenants) {
    const st = t.status || "trial";
    byStatus[st] = (byStatus[st] || 0) + 1;
    const plan = t.plan || "starter";
    if (!byPlan[plan]) byPlan[plan] = { count: 0, active: 0, mrr: 0 };
    byPlan[plan].count++;
    const city = (t.city || "").trim() || "Sin definir";
    byCity[city] = (byCity[city] || 0) + 1;
    const cat = t.business_category || "sin_clasificar";
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    if (st === "active") {
      const m = monthly(t);
      mrr += m;
      byPlan[plan].active++;
      byPlan[plan].mrr += m;
      const g = sub(t)?.payment_gateway || "sin_definir";
      if (!byGateway[g]) byGateway[g] = { count: 0, mrr: 0 };
      byGateway[g].count++;
      byGateway[g].mrr += m;
    }
    const created = new Date(t.created_at).getTime();
    if (created >= startCur) newThisMonth++;
    else if (created >= startPrev) newPrevMonth++;
    const cancelledAt = sub(t)?.cancelled_at ? new Date(sub(t).cancelled_at).getTime() : 0;
    if (cancelledAt >= startCur) cancelledThisMonth++;

    if (st === "trial" && t.trial_ends_at) {
      const days = Math.ceil((new Date(t.trial_ends_at).getTime() - now) / 86400000);
      trialsEnding.push({ id: t.id, name: t.name, plan, city, daysLeft: days });
    }
  }
  trialsEnding.sort((a, b) => a.daysLeft - b.daysLeft);

  // Uso de la plataforma: profesionales, clientes, citas y ventas del mes de todas las empresas.
  const { count: professionals } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true).neq("role", "super_admin");
  const { count: clients } = await supabase.from("clients").select("id", { count: "exact", head: true });
  const { count: appointmentsMonth } = await supabase.from("appointments").select("id", { count: "exact", head: true }).gte("date", cur.first).lte("date", cur.last);

  const income = await fetchAll((f, t) =>
    supabase.from("transactions").select("total, payment_method, tenant_id")
      .eq("type", "income").eq("status", "completed")
      .gte("created_at", cur.startUtc).lt("created_at", cur.endUtc).range(f, t));
  const prevIncome = await fetchAll((f, t) =>
    supabase.from("transactions").select("total")
      .eq("type", "income").eq("status", "completed")
      .gte("created_at", prev.startUtc).lt("created_at", prev.endUtc).range(f, t));
  const volume = income.reduce((s, t) => s + Number(t.total), 0);
  const prevVolume = prevIncome.reduce((s, t) => s + Number(t.total), 0);

  // Volumen por empresa (top) y empresas sin ventas en el mes.
  const perTenant: Record<string, { total: number; count: number }> = {};
  const byMethod: Record<string, number> = {};
  for (const t of income) {
    if (t.tenant_id) {
      if (!perTenant[t.tenant_id]) perTenant[t.tenant_id] = { total: 0, count: 0 };
      perTenant[t.tenant_id].total += Number(t.total);
      perTenant[t.tenant_id].count++;
    }
    byMethod[t.payment_method] = (byMethod[t.payment_method] || 0) + Number(t.total);
  }
  const tenantById = Object.fromEntries(tenants.map((t) => [t.id, t]));
  const topTenants = Object.entries(perTenant)
    .map(([id, v]) => ({ id, name: tenantById[id]?.name || "—", city: (tenantById[id]?.city || "").trim() || "Sin definir", plan: tenantById[id]?.plan || "", ...v }))
    .sort((a, b) => b.total - a.total).slice(0, 6);
  const idleTenants = tenants
    .filter((t) => t.status === "active" && !perTenant[t.id])
    .map((t) => ({ id: t.id, name: t.name, plan: t.plan, city: (t.city || "").trim() || "Sin definir" }))
    .slice(0, 8);

  // Pasarelas de pago que usan los negocios: terminales Mercado Pago y TUU (solo aprobados).
  const mpRows = await fetchAll((f, t) =>
    supabase.from("mp_payment_intents").select("amount").eq("status", "approved")
      .gte("created_at", cur.startUtc).lt("created_at", cur.endUtc).range(f, t));
  const tuuRows = await fetchAll((f, t) =>
    supabase.from("tuu_payment_intents").select("amount").eq("status", "completed")
      .gte("created_at", cur.startUtc).lt("created_at", cur.endUtc).range(f, t));
  const sumAmt = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

  const { data: feeRows } = await supabase.from("gateway_fees").select("gateway, label, fee_pct");
  const fees: Record<string, { label: string; feePct: number | null }> = {};
  for (const f of feeRows || []) fees[f.gateway] = { label: f.label, feePct: f.fee_pct == null ? null : Number(f.fee_pct) };

  const volumeGateways = [
    { gateway: "mercadopago", label: fees.mercadopago?.label || "Mercado Pago", volume: sumAmt(mpRows), count: mpRows.length, feePct: fees.mercadopago?.feePct ?? null },
    { gateway: "tuu", label: fees.tuu?.label || "TUU", volume: sumAmt(tuuRows), count: tuuRows.length, feePct: fees.tuu?.feePct ?? null },
  ].map((g) => ({ ...g, estimatedFee: g.feePct == null ? null : Math.round((g.volume * g.feePct) / 100) }));

  const subscriptionGateways = Object.entries(byGateway).map(([gateway, v]) => {
    const feePct = fees[gateway]?.feePct ?? null;
    return {
      gateway,
      label: gateway === "sin_definir" ? "Sin definir" : fees[gateway]?.label || gateway,
      count: v.count,
      mrr: v.mrr,
      feePct,
      estimatedFee: feePct == null ? null : Math.round((v.mrr * feePct) / 100),
    };
  }).sort((a, b) => b.mrr - a.mrr);

  const totalTenants = tenants.length;
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    tenants: {
      total: totalTenants,
      active: byStatus.active || 0,
      trial: byStatus.trial || 0,
      suspended: byStatus.suspended || 0,
      cancelled: byStatus.cancelled || 0,
      newThisMonth,
      newPrevMonth,
      cancelledThisMonth,
    },
    revenue: { mrr, arr: mrr * 12 },
    byPlan: Object.entries(byPlan)
      .map(([plan, v]) => ({ plan, name: planName[plan] || plan, ...v }))
      .sort((a, b) => b.count - a.count),
    byCity: Object.entries(byCity).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count),
    byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    platform: {
      professionals: professionals || 0,
      clients: clients || 0,
      appointmentsMonth: appointmentsMonth || 0,
      volume,
      prevVolume,
      sales: income.length,
    },
    byMethod: Object.entries(byMethod).map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total),
    subscriptionGateways,
    volumeGateways,
    topTenants,
    idleTenants,
    trialsEnding: trialsEnding.slice(0, 8),
  });
}
