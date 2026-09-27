import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentTenantId, resolveTenantForRequest } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/lib/plan-features";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // No tenant resolved = return nothing. This used to fall through and return EVERY
  // tenant's coupons unfiltered.
  if (!tenantId) return NextResponse.json([]);

  let query = supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

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
  const { code, description, discountType, discountValue, minPurchase, maxUses, validUntil } = body;

  // Scope the new coupon to the caller's business, authorized server-side. Without
  // this, coupons were created with no tenant and then never showed up in the
  // (tenant-filtered) list.
  const { tenantId } = await resolveTenantForRequest(body.tenantId);

  // Item 34: "Cupones de descuento" es feature de plan (Starter+) — Basic no la incluye.
  if (!(await tenantHasFeature(tenantId, "coupons"))) {
    return NextResponse.json({ error: "Los cupones de descuento no estan incluidos en tu plan actual. Mejora tu plan para usarlos." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      code: code.toUpperCase(),
      description,
      discount_type: discountType,
      discount_value: discountValue,
      min_purchase: minPurchase || null,
      max_uses: maxUses || null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      tenant_id: tenantId && tenantId !== "ALL" ? tenantId : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
