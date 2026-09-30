// Logica compartida de los pagos de suscripcion (webhook de Mercado Pago y respaldo al volver el cliente).
import { provisionTenant } from "@/lib/tenant-provisioning";
import { calculateSubscriptionAmount, type BillingPeriod } from "@/lib/subscription-pricing";
import { mpGet, MP_API } from "@/lib/mercadopago";

// ---------------------------------------------------------------------------
// Alta de negocio (compartida por el primer pago mensual y el pago anual)
// ---------------------------------------------------------------------------
export async function provisionFromSignup(signupRequest: any, supabase: any, mpPreapprovalId: string | null) {
  const { data: planConfig } = await supabase
    .from("plan_limits")
    .select("max_professionals, max_branches, price_clp")
    .eq("plan", signupRequest.plan)
    .single();

  const billingPeriod: BillingPeriod = signupRequest.billing_period === "annual" ? "annual" : "monthly";

  try {
    const { tenant } = await provisionTenant({
      name: signupRequest.name,
      slug: signupRequest.slug,
      rutEmpresa: signupRequest.rut_empresa,
      adminEmail: String(signupRequest.admin_email).trim().toLowerCase(),
      adminName: signupRequest.admin_name,
      phone: signupRequest.phone,
      plan: signupRequest.plan,
      maxProfessionals: signupRequest.professionals || planConfig?.max_professionals || 1,
      maxBranches: planConfig?.max_branches || 1,
      status: "active",
      periodDays: billingPeriod === "annual" ? 365 : 30,
      // Se guarda lo que realmente se cobra por ciclo (con profesionales extra, IVA y dcto.)
      priceClp: signupRequest.amount || planConfig?.price_clp || 0,
      billingPeriod,
      mpPreapprovalId,
    });

    await supabase.from("signup_requests").update({ status: "paid", tenant_id: tenant.id }).eq("id", signupRequest.id);
    return tenant;
  } catch (e: any) {
    // Pago/autorizacion confirmados pero fallo el alta (p. ej. slug tomado entretanto):
    // signup_request queda "pending" para que sea visible y reintentable. Nunca se
    // descarta en silencio a un negocio que ya pago.
    console.error("[subscribe/webhook] provisioning failed after confirmed payment:", e.message);
    return null;
  }
}

export async function reactivateTenant(supabase: any, tenantId: string) {
  await supabase.from("tenants").update({ status: "active" }).eq("id", tenantId).in("status", ["past_due", "suspended"]);
}

// ---------------------------------------------------------------------------
// MENSUAL — estado de la suscripcion
// ---------------------------------------------------------------------------
export async function handlePreapprovalUpdate(preapprovalId: string, accessToken: string, supabase: any) {
  const preapproval = await mpGet(`/preapproval/${preapprovalId}`, accessToken);
  if (!preapproval) return;

  const signupRequestId = preapproval.external_reference;
  if (!signupRequestId) return;

  // Reactivacion de un negocio con cobro fallido / suspendido (nueva suscripcion en MP).
  if (typeof signupRequestId === "string" && signupRequestId.startsWith("reactivate:")) {
    await handleReactivation(preapprovalId, preapproval, accessToken, supabase);
    return;
  }

  const { data: signupRequest } = await supabase.from("signup_requests").select("*").eq("id", signupRequestId).single();
  if (!signupRequest) return;

  if (preapproval.status === "authorized" && signupRequest.status === "pending") {
    const tenant = await provisionFromSignup(signupRequest, supabase, preapprovalId);
    if (tenant) {
      // Registrar el primer cobro (el aviso de "authorized_payment" puede no haber llegado).
      try {
        const found = await mpGet(`/authorized_payments/search?preapproval_id=${preapprovalId}`, accessToken);
        for (const r of found?.results || []) {
          if (r?.id) await handleAuthorizedPayment(String(r.id), accessToken, supabase);
        }
      } catch (e: any) {
        console.error("[subscribe/webhook] no se pudo registrar el primer cobro:", e?.message || e);
      }
    }
    return;
  }

  if (preapproval.status === "cancelled" && signupRequest.tenant_id) {
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("mp_preapproval_id", preapprovalId);
  }
}

// ---------------------------------------------------------------------------
// MENSUAL — un cobro periodico
// ---------------------------------------------------------------------------
export async function handleAuthorizedPayment(authorizedPaymentId: string, accessToken: string, supabase: any) {
  const authorizedPayment = await mpGet(`/authorized_payments/${authorizedPaymentId}`, accessToken);
  if (!authorizedPayment) return;

  const preapprovalId = authorizedPayment.preapproval_id;
  if (!preapprovalId) return;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, plan, billing_period")
    .eq("mp_preapproval_id", preapprovalId)
    .single();
  if (!subscription) return;

  // status del authorized_payment: "processed" (cobrado) o "rejected"/"cancelled"; el
  // payment.status anidado (si viene) es el flag exacto de la transaccion con tarjeta.
  const approved = authorizedPayment.status === "processed" || authorizedPayment.payment?.status === "approved";
  const rejected = authorizedPayment.status === "rejected" || authorizedPayment.payment?.status === "rejected";

  const mpPaymentId = String(authorizedPaymentId);
  const { data: existing } = await supabase
    .from("subscription_payments")
    .select("status")
    .eq("mp_payment_id", mpPaymentId)
    .maybeSingle();
  if (existing?.status === "approved") return; // ya aplicado (notificacion repetida)

  await supabase.from("subscription_payments").upsert(
    {
      tenant_id: subscription.tenant_id,
      plan: subscription.plan,
      amount: authorizedPayment.transaction_amount || 0,
      mp_payment_id: mpPaymentId,
      status: approved ? "approved" : rejected ? "rejected" : "pending",
    },
    { onConflict: "mp_payment_id" }
  );

  if (approved) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + (subscription.billing_period === "annual" ? 365 : 30));

    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        grace_until: null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .eq("id", subscription.id);
    await reactivateTenant(supabase, subscription.tenant_id);
  } else if (rejected) {
    // Renovacion fallida: 2 dias de gracia antes de que el cron suspenda el negocio.
    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + 2);

    await supabase
      .from("subscriptions")
      .update({ status: "past_due", grace_until: graceUntil.toISOString() })
      .eq("id", subscription.id);
    await supabase.from("tenants").update({ status: "past_due" }).eq("id", subscription.tenant_id).eq("status", "active");
  }
}

// ---------------------------------------------------------------------------
// ANUAL — pago unico (primer pago, renovacion o mejora de plan)
// ---------------------------------------------------------------------------
export async function handleOneTimePayment(paymentId: string, accessToken: string, supabase: any) {
  const payment = await mpGet(`/v1/payments/${paymentId}`, accessToken);
  if (!payment || payment.status !== "approved") return; // pending/rejected: no se hace nada

  const ref: string = payment.external_reference || "";
  if (!ref) return;

  const mpPaymentId = String(paymentId);
  const { data: existing } = await supabase
    .from("subscription_payments")
    .select("status")
    .eq("mp_payment_id", mpPaymentId)
    .maybeSingle();
  if (existing?.status === "approved") return; // ya aplicado

  const paidAmount = Number(payment.transaction_amount || 0);

  // --- Renovacion anual --------------------------------------------------
  if (ref.startsWith("renew:")) {
    const subscriptionId = ref.slice("renew:".length);
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, plan, current_period_end")
      .eq("id", subscriptionId)
      .single();
    if (!sub) return;

    // Se renueva desde el vencimiento actual (no se pierden dias si paga antes).
    const base = sub.current_period_end && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
    const periodEnd = new Date(base);
    periodEnd.setDate(periodEnd.getDate() + 365);

    await supabase.from("subscription_payments").upsert(
      { tenant_id: sub.tenant_id, plan: sub.plan, amount: paidAmount, mp_payment_id: mpPaymentId, status: "approved" },
      { onConflict: "mp_payment_id" }
    );
    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        grace_until: null,
        amount: paidAmount,
        current_period_start: base.toISOString(),
        current_period_end: periodEnd.toISOString(),
        renewal_reminder_stage: 0,
        cancelled_at: null,
      })
      .eq("id", sub.id);
    await reactivateTenant(supabase, sub.tenant_id);
    return;
  }

  // --- Mejora de plan (diferencia prorrateada) --------------------------
  if (ref.startsWith("upgrade:")) {
    const [, subscriptionId, targetPlan, profRaw] = ref.split(":");
    const professionals = parseInt(profRaw, 10);
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, plan, amount, current_period_end")
      .eq("id", subscriptionId)
      .single();
    const { data: planConfig } = await supabase
      .from("plan_limits")
      .select("max_professionals, max_branches, price_clp, included_professionals, extra_professional_price_clp")
      .eq("plan", targetPlan)
      .single();
    if (!sub || !planConfig || !professionals) return;

    const { monto: newAnnual } = calculateSubscriptionAmount(planConfig, professionals, "annual");

    await supabase.from("subscription_payments").upsert(
      { tenant_id: sub.tenant_id, plan: targetPlan, amount: paidAmount, mp_payment_id: mpPaymentId, status: "approved" },
      { onConflict: "mp_payment_id" }
    );
    await supabase.from("subscriptions").update({ plan: targetPlan, amount: newAnnual }).eq("id", sub.id);
    await supabase
      .from("tenants")
      .update({ plan: targetPlan, max_professionals: professionals, max_branches: planConfig.max_branches })
      .eq("id", sub.tenant_id);
    return;
  }

  // --- Primer pago anual: se crea el negocio ----------------------------
  const { data: signupRequest } = await supabase.from("signup_requests").select("*").eq("id", ref).single();
  if (!signupRequest || signupRequest.status !== "pending") return;

  // Defensa extra: lo pagado debe cubrir lo que calculamos al iniciar el registro.
  if (signupRequest.amount && paidAmount + 1 < Number(signupRequest.amount)) {
    console.error("[subscribe/webhook] monto pagado menor al esperado", { paidAmount, expected: signupRequest.amount });
    return;
  }

  const tenant = await provisionFromSignup(signupRequest, supabase, null);
  if (tenant) {
    await supabase.from("subscription_payments").upsert(
      { tenant_id: tenant.id, plan: signupRequest.plan, amount: paidAmount, mp_payment_id: mpPaymentId, status: "approved" },
      { onConflict: "mp_payment_id" }
    );
  }
}


// ---------------------------------------------------------------------------
// MENSUAL — reactivacion: la suscripcion nueva reemplaza a la que fallo
// ---------------------------------------------------------------------------
async function handleReactivation(preapprovalId: string, preapproval: any, accessToken: string, supabase: any) {
  if (preapproval.status !== "authorized") return;

  const subscriptionId = String(preapproval.external_reference).slice("reactivate:".length);
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, mp_preapproval_id")
    .eq("id", subscriptionId)
    .single();
  if (!sub) return;
  if (sub.mp_preapproval_id === preapprovalId) return; // ya aplicada (aviso repetido)

  const oldPreapprovalId: string | null = sub.mp_preapproval_id;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  await supabase
    .from("subscriptions")
    .update({
      mp_preapproval_id: preapprovalId,
      status: "active",
      grace_until: null,
      cancelled_at: null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq("id", sub.id);
  await reactivateTenant(supabase, sub.tenant_id);

  // La suscripcion anterior se cancela en MP para no cobrar dos veces.
  if (oldPreapprovalId) {
    try {
      await fetch(`${MP_API}/preapproval/${oldPreapprovalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: "cancelled" }),
      });
    } catch (e: any) {
      console.error("[subscribe/webhook] no se pudo cancelar la suscripcion anterior:", e?.message || e);
    }
  }

  // Registrar el cobro de la reactivacion.
  try {
    const found = await mpGet(`/authorized_payments/search?preapproval_id=${preapprovalId}`, accessToken);
    for (const r of found?.results || []) {
      if (r?.id) await handleAuthorizedPayment(String(r.id), accessToken, supabase);
    }
  } catch (e: any) {
    console.error("[subscribe/webhook] no se pudo registrar el cobro de reactivacion:", e?.message || e);
  }
}
