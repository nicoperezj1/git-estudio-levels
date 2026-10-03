import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { CAPACITY_CATEGORY, MAX_CAPACITY } from "@/lib/capacity";

// "Clientes por bloque": cuantos clientes puede atender un profesional a la vez en el mismo
// horario. SOLO para negocios de Kinesiologia. Columna tenants.max_clients_per_slot (migracion
// 093); si aun no existe, todo sigue como siempre (1 cliente por horario).
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ eligible: false, max: 1, limit: MAX_CAPACITY });
  const { data, error } = await supabase.from("tenants").select("business_category, max_clients_per_slot").eq("id", tenantId).maybeSingle();
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    const { data: cat } = await supabase.from("tenants").select("business_category").eq("id", tenantId).maybeSingle();
    return NextResponse.json({ eligible: (cat as any)?.business_category === CAPACITY_CATEGORY, max: 1, limit: MAX_CAPACITY, migrationMissing: missing });
  }
  const eligible = (data as any)?.business_category === CAPACITY_CATEGORY;
  const max = eligible ? Math.max(1, Math.min(MAX_CAPACITY, Number((data as any)?.max_clients_per_slot) || 1)) : 1;
  return NextResponse.json({ eligible, max, limit: MAX_CAPACITY });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const max = Math.floor(Number(body.max));
  if (!Number.isFinite(max) || max < 1 || max > MAX_CAPACITY) {
    return NextResponse.json({ error: `Elige entre 1 y ${MAX_CAPACITY} clientes por bloque` }, { status: 400 });
  }
  const supabase = createAdminSupabase();
  const { data: t } = await supabase.from("tenants").select("business_category").eq("id", tenantId).maybeSingle();
  if (max > 1 && (t as any)?.business_category !== CAPACITY_CATEGORY) {
    return NextResponse.json({ error: "Esta opción es solo para negocios de Kinesiología" }, { status: 400 });
  }
  const { error } = await supabase.from("tenants").update({ max_clients_per_slot: max }).eq("id", tenantId);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 093 en la base de datos." : error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, max });
}
