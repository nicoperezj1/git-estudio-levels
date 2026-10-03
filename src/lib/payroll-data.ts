// Datos de la liquidacion: parametros del mes (con herencia), ficha laboral y los montos que ya existen en
// el sistema (comisiones, quincena y descuentos por planilla del libro de movimientos).
import type { createAdminSupabase } from "@/lib/supabase/server";
import { computeProMonths } from "@/lib/ledger";
import { monthEnd } from "@/lib/accounting";
import { suggestSemanaCorrida, type PayrollParams, type PayslipInput, type ContractType, type PaymentInfo } from "@/lib/payroll";

type Admin = ReturnType<typeof createAdminSupabase>;

export const PARAM_KEYS: Array<keyof PayrollParams> = [
  "uf", "utm", "minWage", "fullTimeHours", "afpCapUf", "afcCapUf", "healthRate", "sisRate", "mutualRate", "reformRate",
  "afcWorkerIndef", "afcEmployerIndef", "afcEmployerFixed", "gratifCapFactor", "taxBrackets",
];

export const EMPTY_PARAMS: PayrollParams = {
  uf: 0, utm: 0, minWage: 0, fullTimeHours: 0, afpCapUf: 0, afcCapUf: 0, healthRate: 0, sisRate: 0, mutualRate: 0, reformRate: 0,
  afcWorkerIndef: 0, afcEmployerIndef: 0, afcEmployerFixed: 0, gratifCapFactor: 0, taxBrackets: [],
};

export type ParamsSource = "tenant" | "tenant_prev" | "global" | "global_prev" | null;

// Parametros efectivos de un mes: los del negocio para ese mes; si no hay, los mas recientes anteriores del
// negocio; luego los globales (del super admin) del mes o anteriores. Nunca inventa valores.
export async function resolveParams(supabase: Admin, tenantId: string, month: string): Promise<{ params: PayrollParams; source: ParamsSource; month: string | null }> {
  const pick = async (tid: string | null, exact: boolean) => {
    let q = supabase.from("payroll_params").select("month, params");
    q = tid ? q.eq("tenant_id", tid) : q.is("tenant_id", null);
    q = exact ? q.eq("month", month) : q.lt("month", month);
    const { data, error } = await q.order("month", { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as any;
  };
  for (const [tid, exact, src] of [[tenantId, true, "tenant"], [tenantId, false, "tenant_prev"], [null, true, "global"], [null, false, "global_prev"]] as const) {
    const row = await pick(tid, exact);
    if (row) return { params: { ...EMPTY_PARAMS, ...(row.params || {}) } as PayrollParams, source: src, month: row.month };
  }
  return { params: { ...EMPTY_PARAMS }, source: null, month: null };
}

export function sanitizeParams(raw: any): PayrollParams {
  const out: any = { ...EMPTY_PARAMS };
  for (const k of PARAM_KEYS) {
    if (k === "taxBrackets") continue;
    const n = Number(raw?.[k]);
    out[k] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const br = Array.isArray(raw?.taxBrackets) ? raw.taxBrackets : [];
  out.taxBrackets = br.map((b: any) => ({
    fromUtm: Math.max(0, Number(b?.fromUtm) || 0),
    toUtm: b?.toUtm === null || b?.toUtm === "" || b?.toUtm === undefined ? null : Number(b.toUtm),
    rate: Math.max(0, Number(b?.rate) || 0),
    deductUtm: Math.max(0, Number(b?.deductUtm) || 0),
  })).sort((a: any, b: any) => a.fromUtm - b.fromUtm);
  return out as PayrollParams;
}

export interface FileRow {
  contract_type: ContractType; hire_date: string | null; weekly_hours: number; base_salary: number; afp_name: string | null; afp_rate: number;
  health_system: "fonasa" | "isapre"; isapre_plan_uf: number | null; colacion: number; movilizacion: number; gratification_mode: "auto" | "manual" | "none";
  rut?: string | null; position?: string | null; cost_center?: string | null;
}

export const EMPTY_PAYMENT: PaymentInfo = { method: "transfer", date: "", bank: "", reference: "", voucher: "", notes: "" };

const sundaysIn = (first: string): number => {
  const last = monthEnd(first);
  let n = 0;
  for (let d = new Date(`${first}T12:00:00Z`); d <= new Date(`${last}T12:00:00Z`); d = new Date(d.getTime() + 86400000)) if (d.getUTCDay() === 0) n++;
  return n;
};
const daysIn = (first: string) => Number(monthEnd(first).slice(8, 10));

// Montos que ya existen en el sistema para ese profesional y mes.
export async function autoAmounts(supabase: Admin, tenantId: string, barberId: string, first: string, workMode: string | null) {
  let commissions = 0;
  if (workMode !== "rental") {
    try {
      const [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
      const months = await computeProMonths(supabase, { tenantId, mode: "commission", year: y, month: m });
      commissions = Math.max(0, Math.round(months.find((x) => x.barberId === barberId)?.base || 0));
    } catch { commissions = 0; }
  }
  let advances = 0, payrollDiscounts = 0;
  const { data } = await supabase.from("professional_ledger").select("kind, amount, effect")
    .eq("tenant_id", tenantId).eq("barber_id", barberId).eq("month", first).eq("status", "active");
  for (const r of (data || []) as any[]) {
    if (r.effect !== -1) continue;
    if (r.kind === "advance") advances += Number(r.amount);
    if (r.kind === "payroll_discount") payrollDiscounts += Number(r.amount);
  }
  return { commissions, advances, payrollDiscounts };
}

export function defaultInputs(file: FileRow, auto: { commissions: number; advances: number; payrollDiscounts: number }, first: string): PayslipInput & { holidays: number; suggestedSemanaCorrida: number } {
  const hireDay = file.hire_date && file.hire_date.slice(0, 7) === first.slice(0, 7) ? Math.max(0, Number(file.hire_date.slice(8, 10)) - 1) : 0;
  const sundays = sundaysIn(first);
  const businessDays = daysIn(first) - sundays;
  return {
    contract: file.contract_type, baseSalary: Number(file.base_salary), weeklyHours: Number(file.weekly_hours),
    absentDays: 0, licenseDays: 0, hiredInMonthDays: hireDay,
    commissions: auto.commissions, semanaCorrida: 0, overtime: 0,
    gratification: { mode: file.gratification_mode },
    colacion: Number(file.colacion), movilizacion: Number(file.movilizacion), extraHaberes: [],
    afpRate: Number(file.afp_rate),
    health: { system: file.health_system, planUf: file.isapre_plan_uf != null ? Number(file.isapre_plan_uf) : undefined },
    advances: auto.advances, payrollDiscounts: auto.payrollDiscounts, otherDiscounts: [], taxOverride: null,
    payment: { ...EMPTY_PAYMENT },
    holidays: 0,
    suggestedSemanaCorrida: suggestSemanaCorrida(auto.commissions, businessDays - hireDay, sundays),
  };
}

// Limpia lo que viene del navegador antes de calcular (nunca se confia en el resultado, solo en los datos).
export function sanitizeInputs(raw: any, base: PayslipInput): PayslipInput {
  const num = (v: any, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const pos = (v: any, d: number) => Math.max(0, num(v, d));
  const mode = ["auto", "manual", "none"].includes(raw?.gratification?.mode) ? raw.gratification.mode : base.gratification.mode;
  return {
    ...base,
    absentDays: Math.min(30, pos(raw?.absentDays, base.absentDays)),
    licenseDays: Math.min(30, pos(raw?.licenseDays, base.licenseDays)),
    commissions: pos(raw?.commissions, base.commissions),
    semanaCorrida: pos(raw?.semanaCorrida, base.semanaCorrida),
    overtime: pos(raw?.overtime, base.overtime),
    gratification: { mode, manual: pos(raw?.gratification?.manual, 0) },
    extraHaberes: (Array.isArray(raw?.extraHaberes) ? raw.extraHaberes : []).slice(0, 20).map((h: any) => ({
      label: String(h?.label || "Haber").slice(0, 60), amount: pos(h?.amount, 0), imponible: !!h?.imponible, tributable: h?.tributable !== false,
    })),
    advances: pos(raw?.advances, base.advances),
    payrollDiscounts: pos(raw?.payrollDiscounts, base.payrollDiscounts),
    otherDiscounts: (Array.isArray(raw?.otherDiscounts) ? raw.otherDiscounts : []).slice(0, 20).map((d: any) => ({
      label: String(d?.label || "Descuento").slice(0, 60), amount: pos(d?.amount, 0), legal: !!d?.legal,
    })),
    payment: {
      method: String(raw?.payment?.method || "transfer").slice(0, 30),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.payment?.date || "")) ? String(raw.payment.date) : "",
      bank: String(raw?.payment?.bank || "").slice(0, 60), reference: String(raw?.payment?.reference || "").slice(0, 60),
      voucher: String(raw?.payment?.voucher || "").slice(0, 40), notes: String(raw?.payment?.notes || "").slice(0, 300),
    },
    taxOverride: raw?.taxOverride === null || raw?.taxOverride === "" || raw?.taxOverride === undefined ? null : pos(raw.taxOverride, 0),
  };
}
