// Shared pricing logic for the paid signup + billing flow (see the spec doc for the
// full design). Used by /api/checkout/subscribe, its webhook, and /api/billing/change-plan
// so the three never drift apart on how the total is computed — the amount charged by
// Mercado Pago must always match what this function returns, recomputed server-side.
//
// IVA (19%) and the annual discount (20%) are applied here, at the end, never shown as
// a separate breakdown to the end user (per Nico: solo "IVA incluido" bajo el total).
//
// NOTE: the tax-compliance side of this (boleta/factura electronica al SII) is NOT
// covered here and needs to be confirmed with an accountant before production use —
// see "Nota sobre IVA" in the spec doc.

export type BillingPeriod = "monthly" | "annual";

export interface PlanPricingConfig {
  price_clp: number;
  included_professionals: number | null;
  extra_professional_price_clp: number | null;
  max_professionals: number;
}

export interface SubscriptionAmount {
  extraCount: number;
  extraTotal: number;
  netoMensual: number;
  totalMensual: number; // con IVA, ciclo mensual
  monto: number; // lo que se cobra en este ciclo (mensual o el total anual con dcto.)
  frequency: number; // en meses: 1 (mensual) o 12 (anual)
}

const IVA_RATE = 0.19;
const ANNUAL_DISCOUNT = 0.2; // 20% off sobre 12 meses

export function calculateSubscriptionAmount(
  plan: PlanPricingConfig,
  professionals: number,
  billingPeriod: BillingPeriod
): SubscriptionAmount {
  const included = plan.included_professionals ?? plan.max_professionals;
  const extraPrice = plan.extra_professional_price_clp ?? 0;

  const extraCount = Math.max(0, professionals - included);
  const extraTotal = extraCount * extraPrice;
  const netoMensual = plan.price_clp + extraTotal;
  const totalMensual = Math.round(netoMensual * (1 + IVA_RATE));

  const monto =
    billingPeriod === "annual" ? Math.round(totalMensual * 12 * (1 - ANNUAL_DISCOUNT)) : totalMensual;

  const frequency = billingPeriod === "annual" ? 12 : 1;

  return { extraCount, extraTotal, netoMensual, totalMensual, monto, frequency };
}

export function validateProfessionals(plan: PlanPricingConfig, professionals: number): string | null {
  if (!Number.isInteger(professionals) || professionals < 1) {
    return "Cantidad de profesionales invalida";
  }
  if (professionals > plan.max_professionals) {
    return `Este plan permite hasta ${plan.max_professionals} profesionales`;
  }
  return null;
}

// Mejora de plan a mitad de ciclo en el plan ANUAL (pago unico): se cobra solo la
// diferencia entre el total anual nuevo y el ya pagado, proporcional al tiempo que
// queda del ano. Si es <= 0 (bajar de plan) no hay nada que cobrar ahora.
export function annualUpgradeDifference(oldAnnualAmount: number, newAnnualAmount: number, periodEnd: Date, now = new Date()): number {
  const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / 86400000);
  const fraction = Math.min(1, remainingDays / 365);
  return Math.round((newAnnualAmount - oldAnnualAmount) * fraction);
}
