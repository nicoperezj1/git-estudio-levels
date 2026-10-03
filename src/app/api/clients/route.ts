import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentTenantId, resolveTenantForRequest } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // If no tenant can be determined, return empty (security: never show all data)
  // EXCEPT: super_admin ("ALL") can see everything
  if (!tenantId) {
    return NextResponse.json({ clients: [], total: 0, page: 1, totalPages: 0 });
  }

  // Build query
  let query = supabase.from("clients").select("*", { count: "exact" }).order("name");

  // Only filter by tenant if not super_admin
  if (tenantId !== "ALL") {
    query = query.eq("tenant_id", tenantId);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ clients: [], total: 0, page, totalPages: 0 });

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    clients: data || [],
    total,
    page,
    limit,
    totalPages,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, email, phone, notes, tenantId, source, sourceDetail } = body;

  // Nico (29-sep): celular y correo son obligatorios — sin ellos no hay registro ni datos
  // del cliente. Se valida tambien aqui (no solo en los formularios).
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  if (!phone || String(phone).replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "El celular es obligatorio" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return NextResponse.json({ error: "El correo es obligatorio y debe ser valido" }, { status: 400 });
  }

  // Always resolve tenant_id: prefer param, fallback to session
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    resolvedTenantId = await getCurrentTenantId();
  }

  // Punto 10 (Pablo): alta manual desde el boton "Nuevo" en Clientes. El formulario
  // mandaba un campo "source" que nunca se guardaba (quedaba solo en el estado del
  // formulario) — quedaba huerfano y Metricas nunca veia estos clientes.
  //
  // Segunda vuelta (26-sep): Pablo pidio canales especificos en vez de un generico
  // "Normal"/"Promocion" — la recepcion siempre pregunta de donde viene el cliente.
  // "walk_in" (Paso por fuera) es el default cuando no se elige nada. "promotion" e
  // "influencer" aceptan un detalle opcional (codigo de descuento / @handle).
  const VALID_SOURCES = ["instagram", "tiktok", "facebook", "google_maps", "promotion", "walk_in", "influencer", "referral"];
  const acquisitionSource = VALID_SOURCES.includes(source) ? source : "walk_in";
  const acquisitionDetail = (source === "promotion" || source === "influencer") ? (sourceDetail || null) : null;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name, email: email || null, phone: phone || null, notes,
      tenant_id: resolvedTenantId || null,
      acquisition_source: acquisitionSource,
      acquisition_detail: acquisitionDetail,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
