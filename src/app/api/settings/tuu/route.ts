import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole } from "@/lib/supabase/server";

// GET: Fetch TUU settings for current tenant (mirrors /api/settings/mercadopago)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const { data } = await supabase
    .from("tenant_settings")
    .select("tuu_api_key, tuu_configured, card_payment_provider")
    .eq("tenant_id", tenantId)
    .single();

  if (!data) {
    return NextResponse.json({ tuu_api_key: "", tuu_configured: false, card_payment_provider: "mercadopago", has_key: false });
  }

  // Mask key for display (show last 6 chars only) — same pattern used for the MP token.
  const maskedKey = data.tuu_api_key
    ? `${"•".repeat(20)}${data.tuu_api_key.slice(-6)}`
    : "";

  return NextResponse.json({
    tuu_api_key: maskedKey,
    tuu_configured: data.tuu_configured || false,
    card_payment_provider: data.card_payment_provider || "mercadopago",
    has_key: !!data.tuu_api_key,
  });
}

// POST: Save TUU settings for tenant (API key and/or which provider is active)
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { tuu_api_key, card_payment_provider } = body;
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // cambiar las credenciales de cobro de cualquier negocio. Solo admin, solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  const update: any = {};

  // Only update the key if it's a real new value (not the masked display version)
  if (tuu_api_key && !tuu_api_key.startsWith("•")) {
    update.tuu_api_key = tuu_api_key;
    update.tuu_configured = true;
  }

  if (card_payment_provider === "mercadopago" || card_payment_provider === "tuu") {
    update.card_payment_provider = card_payment_provider;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { data: existing } = await supabase
    .from("tenant_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();

  if (existing) {
    await supabase.from("tenant_settings").update(update).eq("tenant_id", tenantId);
  } else {
    await supabase.from("tenant_settings").insert({ tenant_id: tenantId, ...update });
  }

  return NextResponse.json({ success: true });
}
