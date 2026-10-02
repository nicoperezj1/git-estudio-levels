import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole } from "@/lib/supabase/server";

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

// Avoid build-time prerendering: this reads from the DB and must not be baked/stale.
export const dynamic = "force-dynamic";

const defaultHours = () =>
  dayNames.map((_, i) => ({
    day_of_week: i,
    open_time: "10:00",
    close_time: "21:00",
    is_closed: i === 0, // Sunday closed
  }));

// GET: business hours for the caller's business
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  let query = supabase.from("business_hours").select("*").order("day_of_week");
  // Scope to the caller's business so salons don't see each other's hours.
  if (tenantId && tenantId !== "ALL") query = query.eq("tenant_id", tenantId);

  const { data } = await query;

  // If no data exists for this business, return sensible defaults
  if (!data || data.length === 0) {
    return NextResponse.json(defaultHours());
  }

  return NextResponse.json(data);
}

// PATCH: Update business hours for a specific day (per business)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { dayOfWeek, openTime, closeTime, isClosed } = body;

  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // pisar los horarios de cualquier negocio. Ahora solo un admin, y solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const supabase = createAdminSupabase();

  if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: "dayOfWeek invalido (0-6)" }, { status: 400 });
  }

  const tenantId = guard.tenantId;

  // The unique index is (tenant_id, day_of_week) — see migration 050. Using only
  // day_of_week here would fail (no matching constraint) or clobber another salon's row.
  const { error } = await supabase
    .from("business_hours")
    .upsert({
      tenant_id: tenantId,
      day_of_week: dayOfWeek,
      open_time: openTime || "10:00",
      close_time: closeTime || "21:00",
      is_closed: isClosed || false,
    }, { onConflict: "tenant_id,day_of_week" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
