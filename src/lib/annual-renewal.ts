import { calculateSubscriptionAmount } from "@/lib/subscription-pricing";
import { createCheckoutPreference, getMpPublicUrl } from "@/lib/mercadopago";

// Crea el link de pago (Checkout Pro) para renovar un plan ANUAL por otro ano.
// El monto se recalcula con el plan y los profesionales actuales del negocio.
// external_reference = "renew:<subscription_id>" -> lo reconoce el webhook.
export async function createAnnualRenewalLink(supabase: any, subscriptionId: string) {
  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!accessToken) return { ok: false as const, error: "Mercado Pago no configurado" };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, plan, billing_period, mp_preapproval_id")
    .eq("id", subscriptionId)
    .single();
  if (!sub || sub.billing_period !== "annual" || sub.mp_preapproval_id) {
    return { ok: false as const, error: "Esta suscripción no es un plan anual de pago unico" };
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("admin_email, max_professionals")
    .eq("id", sub.tenant_id)
    .single();

  const { data: planConfig } = await supabase
    .from("plan_limits")
    .select("name, price_clp, max_professionals, included_professionals, extra_professional_price_clp")
    .eq("plan", sub.plan)
    .single();
  if (!planConfig) return { ok: false as const, error: "Plan invalido" };

  const { monto } = calculateSubscriptionAmount(planConfig, tenant?.max_professionals || 1, "annual");

  const pref = await createCheckoutPreference({
    accessToken,
    title: `re-booking — Renovación Plan ${planConfig.name} (anual)`,
    amount: monto,
    payerEmail: tenant?.admin_email,
    externalReference: `renew:${sub.id}`,
    backUrl: `${getMpPublicUrl()}/dashboard/configuracion/facturacion`,
  });
  if (!pref.ok) return { ok: false as const, error: "No se pudo crear el link de pago" };

  return { ok: true as const, initPoint: pref.initPoint, amount: monto, adminEmail: tenant?.admin_email as string | undefined };
}
