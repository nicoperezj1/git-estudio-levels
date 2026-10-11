import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentTenantId, resolveTenantForRequest } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "true";
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // If no tenant, return empty (except super_admin = "ALL")
  if (!tenantId) {
    return NextResponse.json([]);
  }

  let query = supabase.from("services").select("*").order("sort_order", { ascending: true }).order("name");
  if (tenantId !== "ALL") {
    query = query.eq("tenant_id", tenantId);
  }
  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json([]);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, description, price, duration, sort_order, category, tenantId } = body;
  // Antes no pedia sesion y, para el super admin, guardaba el servicio con el negocio "ALL" (invalido):
  // se avisaba "creado" pero nunca aparecia. Ahora el negocio sale de la sesion (o del que el super admin esta viendo).
  const { role, tenantId: resolved } = await resolveTenantForRequest(tenantId);
  if (!role) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Solo el administrador puede crear servicios" }, { status: 403 });
  if (!resolved || resolved === "ALL") return NextResponse.json({ error: "Elige primero el negocio (Viendo como…) para crear el servicio" }, { status: 400 });

  const { data, error } = await supabase
    .from("services")
    .insert({ name, description, price, duration, sort_order: sort_order || 0, category: category || null, tenant_id: resolved })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
