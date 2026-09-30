import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { MP_API, getMpPublicUrl } from "@/lib/mercadopago";

// POST: "Reactivar suscripcion" — para un negocio MENSUAL con el cobro fallido (past_due) o
// suspendido. Crea una suscripcion nueva en Mercado Pago (para poder poner una tarjeta que
// funcione) con el mismo monto que ya tenia. Devuelve el init_point donde el cliente la
// autoriza; el cobro inmediato regulariza la cuenta.
// Al confirmarse (webhook o /api/billing/sync) se reemplaza la suscripcion vieja por la
// nueva (external_reference "reactivate:<subscription id>") y se reactiva el negocio.
export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede reactivar la suscripción" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "Mercado Pago no configurado" }, { status: 500 });

  const supabase = createAdminSupabase();
  const { data: tenant } = await supabase.from("tenants").select("status, admin_email, plan").eq("id", tenantId).single();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, plan, amount, billing_period, mp_preapproval_id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!tenant || !sub) return NextResponse.json({ error: "Sin suscripción" }, { status: 400 });
  if (sub.billing_period === "annual") {
    return NextResponse.json({ error: "El plan anual se regulariza con «Renovar por otro año»" }, { status: 400 });
  }
  if (!["past_due", "suspended"].includes(tenant.status) && sub.status !== "past_due") {
    return NextResponse.json({ error: "Tu suscripción no necesita reactivarse" }, { status: 400 });
  }
  if (!sub.amount || sub.amount <= 0) {
    return NextResponse.json({ error: "No se pudo determinar el monto de la suscripción" }, { status: 400 });
  }

  const appUrl = getMpPublicUrl();
  const { data: planRow } = await supabase.from("plan_limits").select("name").eq("plan", sub.plan).single();

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      reason: `re-booking — Plan ${planRow?.name || sub.plan} (mensual, reactivación)`,
      external_reference: `reactivate:${sub.id}`,
      payer_email: tenant.admin_email,
      back_url: `${appUrl}/dashboard/configuracion/facturacion`,
      notification_url: `${appUrl}/api/checkout/subscribe/webhook`,
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: sub.amount, currency_id: "CLP" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.init_point) {
    console.error("MercadoPago error (billing/reactivate):", data);
    return NextResponse.json({ error: "No se pudo iniciar la reactivación en Mercado Pago" }, { status: 500 });
  }

  return NextResponse.json({ checkoutUrl: data.init_point });
}
