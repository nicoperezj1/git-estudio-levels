import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";
import { BASE_PRODUCT_CATEGORIES } from "@/lib/product-categories";

// Categorias de producto: las 4 base + las propias del negocio. Leer: admin y recepcion. Agregar: administrador.
export async function GET(req: NextRequest) {
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  const base = [...BASE_PRODUCT_CATEGORIES] as string[];
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ categories: base });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("product_categories").select("name").eq("tenant_id", tenantId).order("name");
  const custom = error ? [] : (data || []).map((c: any) => c.name as string);
  return NextResponse.json({ categories: [...base, ...custom.filter((n) => !base.some((b) => b.toLowerCase() === n.toLowerCase()))] });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  const name = String(body.name || "").trim().slice(0, 40);
  if (!tenantId || tenantId === "ALL" || !name) return NextResponse.json({ error: "Escribe el nombre de la categoría." }, { status: 400 });

  const exists = (BASE_PRODUCT_CATEGORIES as readonly string[]).some((b) => b.toLowerCase() === name.toLowerCase());
  if (!exists) {
    const supabase = createAdminSupabase();
    const { error } = await supabase.from("product_categories").insert({ tenant_id: tenantId, name });
    // 23505 = ya existia: no es un error para quien la agrega.
    if (error && error.code !== "23505") return NextResponse.json({ error: "Falta aplicar la migracion 092 en la base de datos." }, { status: 409 });
  }
  return NextResponse.json({ success: true, name });
}
