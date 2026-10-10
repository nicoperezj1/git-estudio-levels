import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: información pública del negocio por slug (página de reservas).
// Se selecciona "*" y se devuelve solo una lista blanca de campos, así funciona aunque la
// migración 082 (banner, descripción, Maps, vista) todavía no esté aplicada.
function toPublic(t: any) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo_url: t.logo_url ?? null,
    phone: t.phone ?? null,
    address: t.address ?? null,
    website: t.website ?? null,
    banner_url: t.banner_url ?? null,
    description: t.description ?? null,
    google_maps_url: t.google_maps_url ?? null,
    google_rating: t.google_rating ?? null,
    google_reviews_count: t.google_reviews_count ?? null,
    booking_view_mode: t.booking_view_mode ?? "professional",
    booking_window_days: t.booking_window_days ?? null,
    booking_show_profile_direct: !!t.booking_show_profile_direct,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  let found: any = null;
  const { data: tenant } = await supabase.from("tenants").select("*").eq("slug", slug).eq("active", true).single();
  found = tenant;

  if (!found) {
    // Coincidencia parcial (ej: "estudiolevels" coincide con "estudio-levels")
    const { data: tenants } = await supabase.from("tenants").select("*").eq("active", true);
    found = (tenants || []).find((t: any) =>
      t.slug.replace(/-/g, "").toLowerCase() === slug.replace(/-/g, "").toLowerCase()
    ) || null;
  }

  if (!found) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });

  const { data: hours } = await supabase
    .from("business_hours")
    .select("day_of_week, open_time, close_time, is_closed")
    .eq("tenant_id", found.id);

  return NextResponse.json({ ...toPublic(found), suspended: found.status === "suspended", hours: hours || [] });
}
