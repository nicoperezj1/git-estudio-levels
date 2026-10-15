import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Interruptor del seguimiento de publicidad del negocio (solo admin). Apagado por defecto (migracion 112).
async function adminOnly() {
  const c = await getCurrentUserRoleAndTenant();
  if (!c.userId || (c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}

export async function GET() {
  const c = await adminOnly();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { data, error } = await createAdminSupabase().from("tenants").select("ad_tracking_enabled").eq("id", c.tenantId!).maybeSingle();
  return NextResponse.json({ enabled: !error && !!(data as any)?.ad_tracking_enabled, migrationMissing: !!error });
}

export async function POST(req: NextRequest) {
  const c = await adminOnly();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const { error } = await createAdminSupabase().from("tenants").update({ ad_tracking_enabled: b.enabled === true }).eq("id", c.tenantId!);
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? "Falta aplicar la migración 112 en la base de datos." : error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
