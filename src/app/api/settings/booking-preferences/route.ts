import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Preferencias de la página pública de reservas: banner, descripción, Google Maps,
// estrellas/reseñas (manuales) y tipo de vista para el cliente.
const VIEW_MODES = ["time", "professional", "both"];

function pick(t: any) {
  return {
    logo_url: t.logo_url ?? null,
    banner_url: t.banner_url ?? null,
    description: t.description ?? "",
    address: t.address ?? "",
    website: t.website ?? "",
    phone: t.phone ?? "",
    google_maps_url: t.google_maps_url ?? "",
    google_rating: t.google_rating ?? null,
    google_reviews_count: t.google_reviews_count ?? null,
    booking_view_mode: t.booking_view_mode ?? "professional",
    booking_show_profile_direct: !!t.booking_show_profile_direct,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  const { data, error } = await supabase.from("tenants").select("*").eq("id", tenantId).single();
  if (error || !data) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  return NextResponse.json(pick(data));
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({}));
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const update: Record<string, any> = {};

  if (body.description !== undefined) update.description = String(body.description || "").trim().slice(0, 800) || null;

  if (body.google_maps_url !== undefined) {
    const url = String(body.google_maps_url || "").trim();
    if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "El link de Google Maps debe empezar con https://" }, { status: 400 });
    update.google_maps_url = url || null;
  }
  if (body.google_rating !== undefined) {
    if (body.google_rating === null || body.google_rating === "") update.google_rating = null;
    else {
      const r = Number(String(body.google_rating).replace(",", "."));
      if (!isFinite(r) || r < 0 || r > 5) return NextResponse.json({ error: "Las estrellas deben estar entre 0 y 5" }, { status: 400 });
      update.google_rating = Math.round(r * 10) / 10;
    }
  }
  if (body.google_reviews_count !== undefined) {
    if (body.google_reviews_count === null || body.google_reviews_count === "") update.google_reviews_count = null;
    else {
      const n = Math.floor(Number(body.google_reviews_count));
      if (!isFinite(n) || n < 0) return NextResponse.json({ error: "La cantidad de reseñas no es válida" }, { status: 400 });
      update.google_reviews_count = n;
    }
  }
  if (body.booking_view_mode !== undefined) {
    if (!VIEW_MODES.includes(body.booking_view_mode)) return NextResponse.json({ error: "Tipo de vista no válido" }, { status: 400 });
    update.booking_view_mode = body.booking_view_mode;
  }

  if (body.booking_show_profile_direct !== undefined) update.booking_show_profile_direct = !!body.booking_show_profile_direct;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });

  const { error } = await supabase.from("tenants").update(update).eq("id", tenantId);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? `Falta aplicar la migración ${"booking_show_profile_direct" in update ? "103" : "082"} en la base de datos.` : error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
