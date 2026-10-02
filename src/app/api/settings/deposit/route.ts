import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole } from "@/lib/supabase/server";

// GET: Fetch deposit settings for a tenant
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") return NextResponse.json({});

  const { data } = await supabase
    .from("tenant_settings")
    .select("deposit_enabled, deposit_percentage, deposit_min_amount, cancellation_free_hours, deposit_message")
    .eq("tenant_id", tenantId)
    .single();

  return NextResponse.json(data || {
    deposit_enabled: false,
    deposit_percentage: 30,
    cancellation_free_hours: 24,
    deposit_message: "Este servicio requiere un abono para confirmar tu cita.",
  });
}

// POST: Save deposit settings
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { deposit_enabled, deposit_percentage, cancellation_free_hours, deposit_message } = body;
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // cambiar las credenciales de cobro de cualquier negocio. Solo admin, solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  const { error } = await supabase
    .from("tenant_settings")
    .update({
      deposit_enabled,
      deposit_percentage,
      cancellation_free_hours,
      deposit_message,
    })
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
