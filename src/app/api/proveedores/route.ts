import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { toWhatsAppPhone } from "@/lib/supplier-message";

// Proveedores del negocio (nombre del comercio y celular). Solo administrador; siempre dentro de su negocio.
async function guard(tenantParam: string | null) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const;
  const { tenantId, denied } = await resolveTenantForRequest(tenantParam);
  if (denied || !tenantId || tenantId === "ALL") return { error: NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 }) } as const;
  return { tenantId } as const;
}

export async function GET(req: NextRequest) {
  const g = await guard(new URL(req.url).searchParams.get("tenantId"));
  if ("error" in g) return g.error;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("suppliers").select("id, name, phone").eq("tenant_id", g.tenantId).eq("active", true).order("name");
  return NextResponse.json({ suppliers: error ? [] : data || [], migrationMissing: !!error });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const g = await guard(body.tenantId ?? null);
  if ("error" in g) return g.error;
  const name = String(body.name || "").trim().slice(0, 80);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (!name) return NextResponse.json({ error: "Escribe el nombre del comercio." }, { status: 400 });
  if (!toWhatsAppPhone(phone)) return NextResponse.json({ error: "Escribe un celular válido." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("suppliers").insert({ tenant_id: g.tenantId, name, phone }).select("id, name, phone").single();
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 092 en la base de datos." }, { status: 409 });
  return NextResponse.json({ supplier: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const g = await guard(body.tenantId ?? null);
  if ("error" in g) return g.error;
  const name = String(body.name || "").trim().slice(0, 80);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (!body.id || !name || !toWhatsAppPhone(phone)) return NextResponse.json({ error: "Revisa el nombre y el celular." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("suppliers").update({ name, phone }).eq("id", body.id).eq("tenant_id", g.tenantId).select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}

// Quitar un proveedor: se desactiva (queda en la base).
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const g = await guard(searchParams.get("tenantId"));
  if ("error" in g) return g.error;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("suppliers").update({ active: false }).eq("id", id).eq("tenant_id", g.tenantId).select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}
