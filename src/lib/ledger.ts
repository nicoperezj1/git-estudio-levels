// Libro de movimientos del profesional (migracion 091). Una sola regla de signos para Arriendo y Comision.
//
// effect = +1 "a favor del profesional", -1 "en contra del profesional".
//   Comision (el negocio paga):     total = comision sobre servicios + sum(effect * monto)
//   Arriendo (el profesional paga): total = arriendo - sum(effect * monto)
//
// Lineas automaticas (salen de datos que ya existen, no se escriben en el libro):
//   - Propinas del mes (transactions.tip_amount): 100% al profesional que atendio.        effect +1
//   - Comision por venta de productos (products.sales_commission_*).                      effect +1
// Lineas del libro (professional_ledger): dinero a su favor, consumibles, descuento por planilla,
// descuento/quincena y movimientos manuales.
//
// Los productos vendidos NO suman a la base de la comision del profesional (solo generan su comision aparte).

import { chileDayBoundsUtc } from "@/lib/utils";
import { fetchAllRows, monthEnd } from "@/lib/accounting";

export type ProMode = "commission" | "rental";

export const LEDGER_KINDS = {
  money_in_favor: { label: "Dinero a su favor (cobrado por el negocio)", effect: 1 as 1 | -1 },
  consumable: { label: "Consumibles", effect: -1 as 1 | -1 },
  payroll_discount: { label: "Descuento por planilla", effect: -1 as 1 | -1 },
  advance: { label: "Descuento / quincena", effect: -1 as 1 | -1 },
  manual: { label: "Movimiento manual", effect: 1 as 1 | -1 }, // el admin elige el signo
} as const;
export type LedgerKind = keyof typeof LEDGER_KINDS;

export interface LedgerLine {
  key: string;
  label: string;
  amount: number;            // siempre positivo
  effect: 1 | -1;
  source: "auto" | "ledger";
  ledgerId?: string;
  reason?: string | null;
  by?: string | null;
  createdAt?: string;
}

export interface ProMonth {
  barberId: string;
  name: string;
  mode: ProMode;
  // comision
  rate?: number;
  serviceSales?: number;
  productSales?: number;
  // arriendo
  dailyRate?: number;
  daysWorked?: number;
  autoDays?: number;
  base: number;              // comision sobre servicios, o arriendo (dias x valor)
  baseLabel: string;
  lines: LedgerLine[];
  adjustments: number;       // sum(effect * monto)
  total: number;             // comision: base + adj ; arriendo: base - adj (negativo = el negocio le debe)
  paid: number;
  pending: number;
  paidAt: string | null;
  paidBy: string | null;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function isLedgerEnabled(supabase: any, tenantId: string | null): Promise<boolean> {
  if (!tenantId || tenantId === "ALL") return false;
  try {
    const { data, error } = await supabase.from("tenants").select("pro_ledger_enabled").eq("id", tenantId).single();
    if (error) return false;
    return !!(data as any)?.pro_ledger_enabled;
  } catch {
    return false;
  }
}

export async function computeProMonths(
  supabase: any,
  o: { tenantId: string; mode: ProMode; year: number; month: number }
): Promise<ProMonth[]> {
  const { tenantId, mode, year, month } = o;
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = monthEnd(first);
  const startUtc = chileDayBoundsUtc(first).startUtc;
  const endUtc = chileDayBoundsUtc(last).endUtc;

  // Profesionales del modo pedido (work_mode vacio = comision, el valor por defecto).
  let pq = supabase.from("profiles")
    .select("id, name, work_mode, commission_rate, rental_daily_rate")
    .eq("tenant_id", tenantId).eq("role", "barber").eq("active", true).order("name");
  pq = mode === "rental" ? pq.eq("work_mode", "rental") : pq.or("work_mode.eq.commission,work_mode.is.null");
  const { data: pros } = await pq;
  if (!pros || pros.length === 0) return [];
  const ids: string[] = pros.map((p: any) => p.id);

  // Ventas del mes de estos profesionales (sin los "[AJUSTE MANUAL]" antiguos: ahora viven en el libro).
  const txs = await fetchAllRows<any>(() =>
    supabase.from("transactions").select("id, barber_id, total, tip_amount, notes")
      .eq("tenant_id", tenantId).eq("type", "income").eq("status", "completed")
      .in("barber_id", ids).gte("created_at", startUtc).lt("created_at", endUtc)
  ).catch(() => [] as any[]);
  const sales = txs.filter((t) => !String(t.notes || "").startsWith("[AJUSTE MANUAL]"));
  const txBarber = new Map<string, string>(sales.map((t) => [t.id, t.barber_id]));

  // Productos vendidos (por venta) y su comision.
  const items: any[] = [];
  for (const c of chunk(sales.map((t) => t.id), 200)) {
    const { data } = await supabase.from("transaction_items").select("transaction_id, product_id, total, quantity").in("transaction_id", c);
    items.push(...(data || []));
  }
  const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean)));
  const productRule = new Map<string, { type: string | null; value: number }>();
  for (const c of chunk(productIds as string[], 200)) {
    const r = await supabase.from("products").select("id, sales_commission_type, sales_commission_value").in("id", c);
    if (!r.error) for (const p of r.data || []) productRule.set(p.id, { type: p.sales_commission_type, value: Number(p.sales_commission_value) || 0 });
  }

  const productSalesByTx = new Map<string, number>();
  const productCommissionByBarber = new Map<string, number>();
  const productSalesByBarber = new Map<string, number>();
  for (const it of items) {
    if (!it.product_id) continue;
    const barberId = txBarber.get(it.transaction_id);
    if (!barberId) continue;
    const total = Number(it.total) || 0;
    productSalesByTx.set(it.transaction_id, (productSalesByTx.get(it.transaction_id) || 0) + total);
    productSalesByBarber.set(barberId, (productSalesByBarber.get(barberId) || 0) + total);
    const rule = productRule.get(it.product_id);
    let com = 0;
    if (rule?.type === "percent") com = (total * rule.value) / 100;
    else if (rule?.type === "fixed") com = (Number(it.quantity) || 1) * rule.value;
    if (com > 0) productCommissionByBarber.set(barberId, (productCommissionByBarber.get(barberId) || 0) + com);
  }

  // Servicios = venta menos lo vendido como producto (el producto no suma a la produccion).
  const serviceSalesByBarber = new Map<string, number>();
  const tipsByBarber = new Map<string, number>();
  for (const t of sales) {
    const svc = Math.max(0, Number(t.total) - (productSalesByTx.get(t.id) || 0));
    serviceSalesByBarber.set(t.barber_id, (serviceSalesByBarber.get(t.barber_id) || 0) + svc);
    tipsByBarber.set(t.barber_id, (tipsByBarber.get(t.barber_id) || 0) + (Number(t.tip_amount) || 0));
  }

  // Arriendo: dias trabajados (citas completadas, o el valor guardado en rental_records si ya existe).
  const daysByBarber = new Map<string, Set<string>>();
  const savedDays = new Map<string, number>();
  if (mode === "rental") {
    const appts = await fetchAllRows<any>(() =>
      supabase.from("appointments").select("barber_id, date").eq("tenant_id", tenantId).eq("status", "completed").in("barber_id", ids).gte("date", first).lte("date", last)
    ).catch(() => [] as any[]);
    for (const a of appts) {
      if (!daysByBarber.has(a.barber_id)) daysByBarber.set(a.barber_id, new Set());
      daysByBarber.get(a.barber_id)!.add(a.date);
    }
    const { data: recs } = await supabase.from("rental_records").select("barber_id, days_worked").eq("tenant_id", tenantId).eq("month", month).eq("year", year);
    for (const r of recs || []) savedDays.set(r.barber_id, Number(r.days_worked));
  }

  // Libro y liquidaciones.
  const { data: ledgerRows } = await supabase.from("professional_ledger").select("*")
    .eq("tenant_id", tenantId).eq("month", first).eq("status", "active").order("created_at", { ascending: true });
  const { data: settlements } = await supabase.from("professional_settlements").select("*")
    .eq("tenant_id", tenantId).eq("month", first).eq("mode", mode);
  const settlementByBarber = new Map<string, any>((settlements || []).map((s: any) => [s.barber_id, s]));
  // Arriendo: la correccion hecha en el libro manda sobre el valor antiguo de rental_records.
  for (const s of settlements || []) if (s.days_override !== null && s.days_override !== undefined) savedDays.set(s.barber_id, Number(s.days_override));

  return pros.map((p: any): ProMonth => {
    const lines: LedgerLine[] = [];
    const tips = Math.round(tipsByBarber.get(p.id) || 0);
    if (tips > 0) lines.push({ key: "auto-tips", label: "Propinas", amount: tips, effect: 1, source: "auto" });
    const prodCom = Math.round(productCommissionByBarber.get(p.id) || 0);
    if (prodCom > 0) lines.push({ key: "auto-product-commission", label: "Comisión por venta de productos", amount: prodCom, effect: 1, source: "auto" });
    for (const r of (ledgerRows || []).filter((x: any) => x.barber_id === p.id)) {
      const kind = (LEDGER_KINDS as any)[r.kind];
      lines.push({
        key: r.id, ledgerId: r.id, source: "ledger", amount: Number(r.amount), effect: r.effect === 1 ? 1 : -1,
        label: kind?.label || "Movimiento", reason: r.reason, by: r.created_by_name, createdAt: r.created_at,
      });
    }
    const adjustments = lines.reduce((s, l) => s + l.effect * l.amount, 0);

    let base: number, baseLabel: string, extra: Partial<ProMonth>;
    if (mode === "commission") {
      const rate = Number(p.commission_rate) || 40;
      const svc = Math.round(serviceSalesByBarber.get(p.id) || 0);
      base = Math.round((svc * rate) / 100);
      baseLabel = `Comisión ${rate}% sobre servicios`;
      extra = { rate, serviceSales: svc, productSales: Math.round(productSalesByBarber.get(p.id) || 0) };
    } else {
      const dailyRate = Number(p.rental_daily_rate) || 29000;
      const autoDays = daysByBarber.get(p.id)?.size || 0;
      const daysWorked = savedDays.has(p.id) ? (savedDays.get(p.id) as number) : autoDays;
      base = daysWorked * dailyRate;
      baseLabel = `Arriendo: ${daysWorked} día${daysWorked === 1 ? "" : "s"} × ${dailyRate.toLocaleString("es-CL")}`;
      extra = { dailyRate, daysWorked, autoDays };
    }
    const total = mode === "commission" ? base + adjustments : base - adjustments;
    const st = settlementByBarber.get(p.id);
    const paid = st ? Number(st.amount_paid) : 0;
    return {
      barberId: p.id, name: p.name, mode, base, baseLabel, lines, adjustments, total,
      paid, pending: total - paid, paidAt: st?.paid_at || null, paidBy: st?.updated_by_name || null, ...extra,
    };
  });
}
