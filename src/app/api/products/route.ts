import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // If no tenant, return empty (except super_admin)
  if (!tenantId) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("name");

  if (tenantId !== "ALL") {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json([]);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, description, sku, price, cost, stock, min_stock, tenantId } = body;

  // Resolve tenant. Prefer the validated session tenant over the browser-provided id
  // (never trust the client). resolveTenantForRequest forces the caller's own tenant for
  // non-super_admins, so even if the body's tenantId is empty/stale, a logged-in admin
  // still gets their business — this is what fixes the spurious "no se pudo reconocer el
  // negocio" when the client-side tenant context hadn't loaded yet.
  let resolvedTenantId: string | null = null;
  const resolved = await resolveTenantForRequest(tenantId);
  if (resolved.tenantId && resolved.tenantId !== "ALL") {
    resolvedTenantId = resolved.tenantId;
  } else if (resolved.tenantId === "ALL" && tenantId) {
    // super_admin creating for a specific business they selected
    resolvedTenantId = tenantId;
  }

  // A product without a tenant_id is invisible everywhere (the GET filters by tenant),
  // which looks like "the product wasn't created". Fail loudly instead of saving an orphan.
  if (!resolvedTenantId) {
    return NextResponse.json(
      { error: "No se pudo determinar el negocio para el producto. Recarga la pagina e intenta de nuevo." },
      { status: 400 }
    );
  }

  // "Comision por venta" (migracion 091): solo si viene bien formada; si la columna aun no existe, se guarda el
  // producto igual, sin ella.
  const comType = body.sales_commission_type === "percent" || body.sales_commission_type === "fixed" ? body.sales_commission_type : null;
  const comValue = Math.max(0, Number(body.sales_commission_value) || 0);
  const base: Record<string, any> = { name, description, sku, price, cost, stock, min_stock: min_stock || 5, tenant_id: resolvedTenantId };
  let { data, error } = await supabase
    .from("products")
    .insert(comType ? { ...base, sales_commission_type: comType, sales_commission_value: comValue } : base)
    .select()
    .single();
  if (error && comType && /sales_commission/.test(error.message)) {
    ({ data, error } = await supabase.from("products").insert(base).select().single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
