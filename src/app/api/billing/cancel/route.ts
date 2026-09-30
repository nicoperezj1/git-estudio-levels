import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// POST: "Cancelar tu suscripcion" — el negocio deja de pagar. La suscripcion se
// cancela en Mercado Pago (no se vuelve a cobrar), pero el acceso del negocio se
// mantiene hasta el final del periodo ya pagado (subscriptions.current_period_end):
// no se corta al instante. El cron de periodo de gracia (ver doc de spec) es un caso
// distinto (renovacion fallida), no confundir con esta cancelacion voluntaria.
export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede cancelar la suscripción" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, mp_preapproval_id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Este negocio no tiene una suscripción" }, { status: 400 });
  }

  if (subscription.status === "cancelled") {
    return NextResponse.json({ success: true, alreadyCancelled: true });
  }

  // MENSUAL: se cancela la suscripcion en Mercado Pago (no se vuelve a cobrar).
  // ANUAL (pago unico): no hay nada que cancelar en MP; basta con marcarla cancelada
  // para que el cron de renovaciones deje de enviar avisos.
  if (subscription.mp_preapproval_id) {
    const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "Mercado Pago no configurado" }, { status: 500 });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscription.mp_preapproval_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (!mpRes.ok) {
      const errBody = await mpRes.json().catch(() => ({}));
      console.error("MercadoPago error (billing/cancel):", errBody);
      return NextResponse.json({ error: "No se pudo cancelar la suscripción en Mercado Pago" }, { status: 500 });
    }
  }

  await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", subscription.id);

  return NextResponse.json({ success: true });
}
