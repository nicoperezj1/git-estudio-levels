import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { calculateSubscriptionAmount, validateProfessionals, annualUpgradeDifference } from "@/lib/subscription-pricing";
import { MP_API, createCheckoutPreference, getMpPublicUrl } from "@/lib/mercadopago";

// POST: "Mejorar tu plan" — el negocio sube de plan y/o cambia cuantos profesionales
// tiene, sin crear una suscripcion nueva: se actualiza el monto de la suscripcion
// (Preapproval) que ya existe en Mercado Pago.
//
// MENSUAL (Preapproval): se actualiza el monto de la suscripcion en Mercado Pago; el
// nuevo precio aplica desde el proximo cobro (sin prorrateo).
// ANUAL (pago unico): se cobra solo la diferencia prorrateada por lo que queda del ano
// con un link de Checkout Pro; el cambio se aplica cuando el webhook confirma el pago
// (external_reference "upgrade:<sub>:<plan>:<profesionales>"). Bajar de plan en el
// anual no se cobra ni se aplica aqui: rige desde la renovacion (contactar soporte).
// Cambiar de mensual a anual (o viceversa) no esta cubierto todavía.
export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede cambiar el plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { plan, professionals: professionalsRaw } = body;

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan, billing_period, mp_preapproval_id, amount, current_period_end, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const isAnnualOneTime = subscription?.billing_period === "annual" && !subscription?.mp_preapproval_id;
  if (!subscription || subscription.status === "cancelled" || (!subscription.mp_preapproval_id && !isAnnualOneTime)) {
    return NextResponse.json({ error: "Este negocio no tiene una suscripción de pago activa" }, { status: 400 });
  }
  if (plan === "enterprise") {
    return NextResponse.json({ error: "El plan Enterprise se contrata con un ejecutivo de ventas" }, { status: 400 });
  }

  const targetPlan = plan || subscription.plan;
  const { data: planConfig } = await supabase
    .from("plan_limits")
    .select("name, price_clp, max_professionals, max_branches, included_professionals, extra_professional_price_clp")
    .eq("plan", targetPlan)
    .single();

  if (!planConfig) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const professionals = Number.isFinite(Number(professionalsRaw))
    ? Math.round(Number(professionalsRaw))
    : planConfig.included_professionals || 1;

  const professionalsError = validateProfessionals(planConfig, professionals);
  if (professionalsError) {
    return NextResponse.json({ error: professionalsError }, { status: 400 });
  }

  const billingPeriod = subscription.billing_period === "annual" ? "annual" : "monthly";
  const { monto } = calculateSubscriptionAmount(planConfig, professionals, billingPeriod);

  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Mercado Pago no configurado" }, { status: 500 });
  }

  if (isAnnualOneTime) {
    const diff = annualUpgradeDifference(
      Number(subscription.amount || 0),
      monto,
      subscription.current_period_end ? new Date(subscription.current_period_end) : new Date()
    );
    if (diff <= 0) {
      return NextResponse.json(
        { error: "Para bajar de plan o de profesionales en el plan anual, el cambio aplica desde tu renovación. Contactanos." },
        { status: 400 }
      );
    }
    const { data: tenantRow } = await supabase.from("tenants").select("admin_email").eq("id", tenantId).single();
    const pref = await createCheckoutPreference({
      accessToken,
      title: `re-booking — Mejora a Plan ${planConfig.name} (diferencia del año en curso)`,
      amount: diff,
      payerEmail: tenantRow?.admin_email,
      externalReference: `upgrade:${subscription.id}:${targetPlan}:${professionals}`,
      backUrl: `${getMpPublicUrl()}/dashboard/configuracion/facturacion`,
    });
    if (!pref.ok) {
      return NextResponse.json({ error: "No se pudo crear el link de pago" }, { status: 500 });
    }
    return NextResponse.json({ checkoutUrl: pref.initPoint, amount: diff });
  }

  const mpRes = await fetch(`${MP_API}/preapproval/${subscription.mp_preapproval_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ auto_recurring: { transaction_amount: monto, currency_id: "CLP" } }),
  });

  if (!mpRes.ok) {
    const errBody = await mpRes.json().catch(() => ({}));
    console.error("MercadoPago error (billing/change-plan):", errBody);
    return NextResponse.json({ error: "No se pudo actualizar la suscripción en Mercado Pago" }, { status: 500 });
  }

  await supabase
    .from("subscriptions")
    .update({ plan: targetPlan, amount: monto })
    .eq("id", subscription.id);

  await supabase
    .from("tenants")
    .update({ plan: targetPlan, max_professionals: professionals })
    .eq("id", tenantId);

  return NextResponse.json({ success: true, plan: targetPlan, professionals, amount: monto });
}
