import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// GET: Datos de la suscripcion del negocio para la pantalla "Plan y facturacion"
// (src/app/dashboard/configuracion/facturacion). Incluye la lista de planes para el
// selector de "mejorar tu plan".
export async function GET(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede ver esto" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId") || undefined);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan, max_professionals, status")
    .eq("id", tenantId)
    .single();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, amount, billing_period, current_period_end, mp_preapproval_id, grace_until")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: plans } = await supabase
    .from("plan_limits")
    .select("plan, name, price_clp, max_professionals, included_professionals, extra_professional_price_clp")
    .neq("plan", "enterprise") // Enterprise no es self-serve (cotiza ventas)
    .order("price_clp", { ascending: true });

  return NextResponse.json({ tenant, subscription, plans: plans || [] });
}
