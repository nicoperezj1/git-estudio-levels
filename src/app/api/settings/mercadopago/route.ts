import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole } from "@/lib/supabase/server";

// GET: Fetch MP settings for current tenant
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
    .select("mp_access_token, mp_device_id, mp_device_name, mp_configured")
    .eq("tenant_id", tenantId)
    .single();

  if (!data) {
    return NextResponse.json({ mp_access_token: "", mp_device_id: "", mp_device_name: "", mp_configured: false });
  }

  // Mask token for display (show last 8 chars only)
  const maskedToken = data.mp_access_token
    ? `${"•".repeat(20)}${data.mp_access_token.slice(-8)}`
    : "";

  return NextResponse.json({
    mp_access_token: maskedToken,
    mp_device_id: data.mp_device_id || "",
    mp_device_name: data.mp_device_name || "",
    mp_configured: data.mp_configured || false,
    has_token: !!data.mp_access_token,
  });
}

// POST: Save MP settings for tenant
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { mp_access_token, mp_device_id, mp_device_name } = body;
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // cambiar las credenciales de cobro de cualquier negocio. Solo admin, solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  // Build update object - only update token if a new one is provided (not masked)
  const update: any = {
    mp_device_id: mp_device_id || null,
    mp_device_name: mp_device_name || null,
    mp_configured: !!(mp_access_token || mp_device_id),
  };

  // Only update token if it's a real new token (not the masked version)
  if (mp_access_token && !mp_access_token.startsWith("•")) {
    update.mp_access_token = mp_access_token;
  }

  // Upsert tenant_settings
  const { data: existing } = await supabase
    .from("tenant_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();

  if (existing) {
    await supabase
      .from("tenant_settings")
      .update(update)
      .eq("tenant_id", tenantId);
  } else {
    await supabase
      .from("tenant_settings")
      .insert({ tenant_id: tenantId, ...update });
  }

  return NextResponse.json({ success: true });
}
