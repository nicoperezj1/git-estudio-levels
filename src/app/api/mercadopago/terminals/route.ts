import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, authorizeProfileAccess } from "@/lib/supabase/server";

// GET: List rental barbers (with own MP terminal) for a tenant.
// IMPORTANT: this used to have no tenant filter at all, so any admin fetching this
// endpoint got every rental barber across every tenant in the whole app — a real
// cross-tenant data leak (this app has multiple businesses, e.g. Estudio Levels and
// Saray Business). Now scoped and authorized server-side.
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ terminals: [] });
  }

  const { data: barbers } = await supabase
    .from("profiles")
    .select("id, name, work_mode, mp_access_token, mp_device_id, mp_external_id")
    .eq("tenant_id", tenantId)
    .eq("role", "barber")
    .eq("active", true)
    .eq("work_mode", "rental")
    .order("name");

  const terminals = (barbers || []).map((b) => ({
    id: b.id,
    name: b.name,
    workMode: b.work_mode,
    hasToken: !!b.mp_access_token,
    deviceId: b.mp_device_id,
    externalId: b.mp_external_id,
  }));

  return NextResponse.json({ terminals });
}

// POST: Save terminal config for a barber
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { barberId, accessToken, deviceId, externalId } = await req.json();

  if (!barberId) {
    return NextResponse.json({ error: "barberId required" }, { status: 400 });
  }

  // SEGURIDAD: antes no pedia sesion: se podia poner un token de cobro propio en el perfil de
  // cualquier profesional y desviar sus pagos. Solo un admin del mismo negocio.
  const access = await authorizeProfileAccess(barberId);
  if (!access.ok) return access.response;
  if (access.level !== "admin" && access.level !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const updateData: Record<string, string | null> = {
    mp_device_id: deviceId || null,
    mp_external_id: externalId || null,
  };

  // Only update token if provided (don't overwrite with empty)
  if (accessToken) {
    updateData.mp_access_token = accessToken;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", barberId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
