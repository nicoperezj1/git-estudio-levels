import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Correo al que llegan las solicitudes de insumos. Lo elige el administrador; vacio = el correo del administrador.
export async function GET(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ email: "", fallback: "" });
  const supabase = createAdminSupabase();
  const { data: t, error } = await supabase.from("tenants").select("admin_email, supply_request_email").eq("id", tenantId).single();
  if (error) {
    const { data: t2 } = await supabase.from("tenants").select("admin_email").eq("id", tenantId).single();
    return NextResponse.json({ email: "", fallback: t2?.admin_email || "", migrationMissing: true });
  }
  return NextResponse.json({ email: (t as any)?.supply_request_email || "", fallback: t?.admin_email || "" });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  const email = String(body.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("tenants").update({ supply_request_email: email || null }).eq("id", tenantId);
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 092 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true });
}
