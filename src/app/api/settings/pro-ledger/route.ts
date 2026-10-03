import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Interruptor por negocio del "libro de movimientos del profesional" (migracion 091).
// Apagado (por defecto): Arriendo y Comisiones calculan como siempre. Encendido: usan el libro.
// Solo el administrador lo cambia. Si la columna aun no existe, queda apagado y avisa.

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ enabled: false, migrationMissing: false });
  const { data, error } = await supabase.from("tenants").select("pro_ledger_enabled").eq("id", tenantId).single();
  if (error) return NextResponse.json({ enabled: false, migrationMissing: /column .* does not exist|schema cache/i.test(error.message) });
  return NextResponse.json({ enabled: !!(data as any)?.pro_ledger_enabled, migrationMissing: false });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("tenants").update({ pro_ledger_enabled: !!body.enabled }).eq("id", tenantId);
  if (error) {
    return NextResponse.json({ error: "Falta aplicar la migracion 091 en la base de datos." }, { status: 409 });
  }
  return NextResponse.json({ success: true, enabled: !!body.enabled });
}
