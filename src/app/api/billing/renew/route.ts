import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { createAnnualRenewalLink } from "@/lib/annual-renewal";

// POST: "Renovar ahora" — solo para el plan anual (pago unico, no se renueva solo).
// Devuelve el link de Mercado Pago para pagar otro ano.
export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede renovar el plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!subscription) return NextResponse.json({ error: "Sin suscripción" }, { status: 400 });

  const link = await createAnnualRenewalLink(supabase, subscription.id);
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 400 });

  return NextResponse.json({ checkoutUrl: link.initPoint });
}
