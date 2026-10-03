// Remuneraciones (Fase 7): calculo de la liquidacion de sueldo para trabajadores CON CONTRATO.
// HERRAMIENTA DE APOYO: valida siempre con tu contador. Ningun valor legal esta fijo en el codigo: UF, UTM,
// sueldo minimo, topes, tasas y tramos del impuesto vienen de los "parametros del mes" que carga el
// administrador (o el super admin, una vez, para todos). Sin parametros no se calcula.
//
// Corrige los errores de la plantilla Excel original:
//  1. Los aportes del empleador (SIS, AFC empleador, Mutual) ahora SI usan tope.
//  2. La marca "Tributable" se usa: el impuesto sale solo (corregible a mano).
//  3. Dias trabajados, licencias, horas semanales y gratificacion automatica se usan: el sueldo se ajusta
//     por ausencias.
//  4. Las comisiones del libro de movimientos se conectan a la liquidacion (se arman en la API).
//  5. "Plan salud adicional" es el TOTAL del plan de Isapre (en UF): lo adicional es lo que pasa del 7%.
//  6. Valida sueldo minimo proporcional y el tope de 15% de descuentos.
//  7. Incluye el aporte del empleador de la reforma de pensiones (Ley 21.735).

export type ContractType = "indefinido" | "plazo_fijo" | "obra";

export interface TaxBracket { fromUtm: number; toUtm: number | null; rate: number; deductUtm: number } // rate en %

export interface PayrollParams {
  uf: number;
  utm: number;
  minWage: number;            // sueldo minimo mensual (jornada completa)
  fullTimeHours: number;      // horas semanales de jornada completa vigentes
  afpCapUf: number;           // tope imponible AFP / salud, en UF
  afcCapUf: number;           // tope imponible seguro de cesantia, en UF
  healthRate: number;         // % (7)
  sisRate: number;            // % empleador
  mutualRate: number;         // % empleador (mutual / ley 16.744)
  reformRate: number;         // % empleador, reforma de pensiones (Ley 21.735)
  afcWorkerIndef: number;     // % trabajador (contrato indefinido)
  afcEmployerIndef: number;   // % empleador indefinido
  afcEmployerFixed: number;   // % empleador plazo fijo / obra
  gratifCapFactor: number;    // 4.75 ingresos minimos (tope de la gratificacion legal)
  taxBrackets: TaxBracket[];  // impuesto unico de segunda categoria, tramos en UTM
}

export interface ExtraHaber { label: string; amount: number; imponible: boolean; tributable: boolean }
// `legal` = descuento legal que NO cuenta para el tope de 15% (pension alimenticia / retencion judicial,
// cuota sindical, etc.), como en la plantilla Excel (columna Tipo = Legal).
export interface ExtraDiscount { label: string; amount: number; legal?: boolean }
export interface PaymentInfo { method: string; date: string; bank: string; reference: string; voucher: string; notes: string }

export interface PayslipInput {
  contract: ContractType;
  baseSalary: number;           // sueldo base mensual de la jornada contratada
  weeklyHours: number;          // horas semanales contratadas
  absentDays: number;           // faltas sin goce
  licenseDays: number;          // licencias medicas (sin goce del empleador)
  hiredInMonthDays?: number;    // dias del mes ANTES del ingreso (si ingreso a mitad de mes)
  commissions: number;          // comisiones del mes (libro de movimientos)
  semanaCorrida: number;        // monto final (editable; se sugiere con `suggestSemanaCorrida`)
  overtime: number;
  gratification: { mode: "auto" | "manual" | "none"; manual?: number };
  colacion: number;
  movilizacion: number;
  extraHaberes: ExtraHaber[];
  afpRate: number;              // % total de la AFP (incluye su comision)
  health: { system: "fonasa" | "isapre"; planUf?: number };
  advances: number;             // quincena / anticipos (no cuentan para el tope de 15%)
  payrollDiscounts: number;     // descuento por planilla (cuenta para el 15%)
  otherDiscounts: ExtraDiscount[];
  taxOverride?: number | null;  // impuesto escrito a mano (si se quiere corregir el calculo)
  payment?: PaymentInfo;        // forma de pago y constancia (seccion 6 de la plantilla)
}

export interface PayslipResult {
  paidDays: number;
  lines: { haberes: Array<{ label: string; amount: number; imponible: boolean }>; descuentos: Array<{ label: string; amount: number; kind: "legal" | "tax" | "other" | "advance" }> };
  proportionalSalary: number;
  gratification: number;
  imponible: number;
  baseAfp: number;             // imponible con tope AFP/salud
  baseAfc: number;             // imponible con tope cesantia
  afp: number;
  health7: number;
  healthTotal: number;
  healthExtra: number;         // lo que el plan de Isapre cobra sobre el 7%
  afc: number;
  taxableBase: number;
  tax: number;
  taxAuto: number;
  taxOverridden: boolean;
  totalHaberes: number;
  totalDescuentos: number;
  net: number;
  employer: { sis: number; afc: number; mutual: number; reform: number; total: number };
  totalCost: number;
  otherDiscountsTotal: number;
  discountPct: number;         // otros descuentos / imponible, en %
  warnings: Array<{ level: "error" | "warn"; text: string }>;
}

const r = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const pos = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

// Semana corrida SUGERIDA para trabajadores con pago variable (comisiones): lo variable dividido por los dias
// habiles trabajados, por cada domingo / festivo del mes. Es una sugerencia: el administrador la confirma.
export function suggestSemanaCorrida(variablePay: number, workedBusinessDays: number, sundaysAndHolidays: number): number {
  if (!(workedBusinessDays > 0) || !(sundaysAndHolidays > 0) || !(variablePay > 0)) return 0;
  return r((variablePay / workedBusinessDays) * sundaysAndHolidays);
}

// Impuesto unico de segunda categoria: base tributable / UTM -> tramo -> base * tasa - rebaja (en UTM).
export function computeTax(taxableBase: number, params: Pick<PayrollParams, "utm" | "taxBrackets">): number {
  if (!(taxableBase > 0) || !(params.utm > 0) || params.taxBrackets.length === 0) return 0;
  const inUtm = taxableBase / params.utm;
  const br = params.taxBrackets.find((b) => inUtm >= b.fromUtm && (b.toUtm === null || inUtm <= b.toUtm));
  if (!br || !(br.rate > 0)) return 0;
  return Math.max(0, r(taxableBase * (br.rate / 100) - br.deductUtm * params.utm));
}

export function paramsMissing(p: Partial<PayrollParams> | null | undefined): string[] {
  const need: Array<[keyof PayrollParams, string]> = [
    ["uf", "UF"], ["utm", "UTM"], ["minWage", "sueldo mínimo"], ["afpCapUf", "tope imponible AFP (UF)"], ["afcCapUf", "tope seguro de cesantía (UF)"],
  ];
  const out = need.filter(([k]) => !(Number((p as any)?.[k]) > 0)).map(([, l]) => l);
  if (!p?.taxBrackets || p.taxBrackets.length === 0) out.push("tramos del impuesto único");
  return out;
}

export function computePayslip(i: PayslipInput, p: PayrollParams): PayslipResult {
  const warnings: PayslipResult["warnings"] = [];
  const miss = paramsMissing(p);
  if (miss.length) warnings.push({ level: "error", text: `Faltan parámetros del mes: ${miss.join(", ")}.` });

  const paidDays = Math.max(0, Math.min(30, 30 - (i.hiredInMonthDays || 0) - pos(i.absentDays) - pos(i.licenseDays)));
  const proportionalSalary = r((pos(i.baseSalary) * paidDays) / 30);

  const extraImp = i.extraHaberes.filter((h) => h.imponible);
  const extraImpTotal = extraImp.reduce((s, h) => s + pos(h.amount), 0);
  const extraNoImp = i.extraHaberes.filter((h) => !h.imponible);

  const variable = pos(i.commissions) + pos(i.semanaCorrida) + pos(i.overtime) + extraImpTotal;
  // Gratificacion legal (art. 50): 25% de lo devengado con tope de 4,75 ingresos minimos al ano, en cuotas mensuales.
  const gratifBase = proportionalSalary + variable;
  const gratifCapMonthly = p.minWage > 0 ? r((p.gratifCapFactor * p.minWage) / 12) : Infinity;
  let gratification = 0;
  if (i.gratification.mode === "auto") gratification = Math.min(r(gratifBase * 0.25), gratifCapMonthly);
  else if (i.gratification.mode === "manual") gratification = r(pos(i.gratification.manual || 0));

  const imponible = proportionalSalary + variable + gratification;
  const topeAfp = r(pos(p.afpCapUf) * pos(p.uf));
  const topeAfc = r(pos(p.afcCapUf) * pos(p.uf));
  const baseAfp = topeAfp > 0 ? Math.min(imponible, topeAfp) : imponible;
  const baseAfc = topeAfc > 0 ? Math.min(imponible, topeAfc) : imponible;

  const afp = r((baseAfp * pos(i.afpRate)) / 100);
  const health7 = r((baseAfp * pos(p.healthRate)) / 100);
  let healthTotal = health7;
  if (i.health.system === "isapre" && pos(i.health.planUf || 0) > 0) {
    healthTotal = Math.max(health7, r(pos(i.health.planUf || 0) * pos(p.uf)));
  }
  const healthExtra = healthTotal - health7;
  const afc = i.contract === "indefinido" ? r((baseAfc * pos(p.afcWorkerIndef)) / 100) : 0;

  // Base tributable: lo imponible y marcado tributable, menos las cotizaciones del trabajador (salud solo hasta el 7%).
  const impNotTributable = extraImp.filter((h) => !h.tributable).reduce((s, h) => s + pos(h.amount), 0);
  const noImpTributable = extraNoImp.filter((h) => h.tributable).reduce((s, h) => s + pos(h.amount), 0);
  const tributableHaberes = imponible - impNotTributable + noImpTributable;
  const taxableBase = Math.max(0, tributableHaberes - afp - health7 - afc);
  const taxAuto = computeTax(taxableBase, p);
  const taxOverridden = i.taxOverride != null && Number.isFinite(Number(i.taxOverride));
  const tax = taxOverridden ? r(pos(Number(i.taxOverride))) : taxAuto;

  // Para el tope de 15% solo cuentan planilla y los otros descuentos NO legales (la quincena y los legales no).
  const otherDiscountsTotal = r(pos(i.payrollDiscounts) + i.otherDiscounts.filter((d) => !d.legal).reduce((s, d) => s + pos(d.amount), 0));
  const advances = r(pos(i.advances));

  const haberes: PayslipResult["lines"]["haberes"] = [
    { label: `Sueldo base (${paidDays} de 30 días)`, amount: proportionalSalary, imponible: true },
    ...(pos(i.commissions) ? [{ label: "Comisiones", amount: r(i.commissions), imponible: true }] : []),
    ...(pos(i.semanaCorrida) ? [{ label: "Semana corrida", amount: r(i.semanaCorrida), imponible: true }] : []),
    ...(pos(i.overtime) ? [{ label: "Horas extra", amount: r(i.overtime), imponible: true }] : []),
    ...(gratification ? [{ label: "Gratificación", amount: gratification, imponible: true }] : []),
    ...extraImp.filter((h) => pos(h.amount)).map((h) => ({ label: h.label, amount: r(h.amount), imponible: true })),
    ...(pos(i.colacion) ? [{ label: "Colación", amount: r(i.colacion), imponible: false }] : []),
    ...(pos(i.movilizacion) ? [{ label: "Movilización", amount: r(i.movilizacion), imponible: false }] : []),
    ...extraNoImp.filter((h) => pos(h.amount)).map((h) => ({ label: h.label, amount: r(h.amount), imponible: false })),
  ];
  const totalHaberes = haberes.reduce((s, h) => s + h.amount, 0);

  const descuentos: PayslipResult["lines"]["descuentos"] = [
    { label: "AFP", amount: afp, kind: "legal" },
    { label: i.health.system === "isapre" ? "Salud (Isapre, total del plan)" : "Salud (Fonasa)", amount: healthTotal, kind: "legal" },
    ...(afc ? [{ label: "Seguro de cesantía", amount: afc, kind: "legal" as const }] : []),
    ...(tax ? [{ label: taxOverridden ? "Impuesto único (corregido a mano)" : "Impuesto único", amount: tax, kind: "tax" as const }] : []),
    ...(advances ? [{ label: "Quincena / anticipos", amount: advances, kind: "advance" as const }] : []),
    ...(pos(i.payrollDiscounts) ? [{ label: "Descuento por planilla", amount: r(i.payrollDiscounts), kind: "other" as const }] : []),
    ...i.otherDiscounts.filter((d) => pos(d.amount)).map((d) => ({ label: d.label, amount: r(d.amount), kind: (d.legal ? "legal" : "other") as "legal" | "other" })),
  ];
  const totalDescuentos = descuentos.reduce((s, d) => s + d.amount, 0);
  const net = totalHaberes - totalDescuentos;

  const sis = r((baseAfp * pos(p.sisRate)) / 100);
  const afcEmp = r((baseAfc * pos(i.contract === "indefinido" ? p.afcEmployerIndef : p.afcEmployerFixed)) / 100);
  const mutual = r((baseAfp * pos(p.mutualRate)) / 100);
  const reform = r((baseAfp * pos(p.reformRate)) / 100);
  const employerTotal = sis + afcEmp + mutual + reform;

  const discountPct = imponible > 0 ? (otherDiscountsTotal / imponible) * 100 : 0;

  // ---- Revisiones ----
  if (p.minWage > 0 && p.fullTimeHours > 0 && i.weeklyHours > 0) {
    const minProp = r((p.minWage * (paidDays / 30) * Math.min(1, i.weeklyHours / p.fullTimeHours)));
    if (proportionalSalary < minProp) warnings.push({ level: "warn", text: `El sueldo base proporcional ($${proportionalSalary.toLocaleString("es-CL")}) está bajo el mínimo proporcional ($${minProp.toLocaleString("es-CL")}).` });
  }
  if (discountPct > 15) warnings.push({ level: "warn", text: `Los descuentos (planilla y otros) son ${discountPct.toFixed(1)}% de la remuneración; el tope legal es 15%.` });
  if (net <= 0) warnings.push({ level: "error", text: "El líquido a pagar es cero o negativo. Revisa los descuentos." });
  if (paidDays === 0) warnings.push({ level: "warn", text: "No hay días pagados este mes." });
  if (taxOverridden) warnings.push({ level: "warn", text: `El impuesto fue corregido a mano (el cálculo automático daba $${taxAuto.toLocaleString("es-CL")}).` });
  if (imponible > topeAfp && topeAfp > 0) warnings.push({ level: "warn", text: "La remuneración supera el tope imponible: las cotizaciones se calcularon con el tope." });

  return {
    paidDays, lines: { haberes, descuentos }, proportionalSalary, gratification, imponible, baseAfp, baseAfc,
    afp, health7, healthTotal, healthExtra, afc, taxableBase, tax, taxAuto, taxOverridden,
    totalHaberes, totalDescuentos, net,
    employer: { sis, afc: afcEmp, mutual, reform, total: employerTotal },
    totalCost: totalHaberes + employerTotal, otherDiscountsTotal, discountPct, warnings,
  };
}
