import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Ajustes de la Fase 5 por negocio: Standby nuevo (apagado por defecto) y tope de efectivo en caja
// (vacio = sin tope, no se pide ninguna reduccion). Columnas tenants.standby_v2_enabled y
// tenants.cash_cap (migracion 094); si aun no existen, todo sigue como siempre.
export async function GET(req: NextRequest) {
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ standbyV2: false, cashCap: null });
  const supabase = createAdminSupabase();
  // cajaLock viene de la migracion 098: si aun no existe, se lee lo demas sin ella (el bloqueo queda apagado).
  let { data, error } = await supabase.from("tenants").select("standby_v2_enabled, cash_cap, caja_lock_enabled").eq("id", tenantId).maybeSingle();
  if (error) ({ data, error } = (await supabase.from("tenants").select("standby_v2_enabled, cash_cap").eq("id", tenantId).maybeSingle()) as any);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ standbyV2: false, cashCap: null, cajaLock: false, migrationMissing: missing });
  }
  const cap = Number((data as any)?.cash_cap);
  return NextResponse.json({ standbyV2: !!(data as any)?.standby_v2_enabled, cashCap: Number.isFinite(cap) && cap > 0 ? cap : null, cajaLock: !!(data as any)?.caja_lock_enabled });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const update: Record<string, any> = {};
  if (typeof body.standbyV2 === "boolean") update.standby_v2_enabled = body.standbyV2;
  if (typeof body.cajaLock === "boolean") update.caja_lock_enabled = body.cajaLock;
  if ("cashCap" in body) {
    if (body.cashCap === null || body.cashCap === "") update.cash_cap = null;
    else {
      const n = Math.round(Number(body.cashCap));
      if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return NextResponse.json({ error: "El tope debe ser un monto mayor a 0." }, { status: 400 });
      update.cash_cap = n;
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("tenants").update(update).eq("id", tenantId);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? `Falta aplicar la migración ${"caja_lock_enabled" in update ? "098" : "094"} en la base de datos.` : error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
