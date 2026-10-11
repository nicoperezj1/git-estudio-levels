import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { TAB_CATALOG, MAX_TABS, cleanKeys, roleCanSee, toTabRole, type TabRole } from "@/lib/mobile-tabs";

// Barra inferior del celular (migracion 108). Sin la migracion todo sigue con los atajos de siempre.
//   GET  -> { mine, tenant }       mine: lo que eligio este usuario; tenant: lo del negocio por rol.
//   PUT  -> { scope: "me",     keys | null }              guarda (o borra con null) los atajos propios.
//           { scope: "tenant", role, keys | null }        solo administrador: atajos por defecto del negocio para un rol.
export async function GET() {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();

  const [{ data: p, error: pErr }, tRes] = await Promise.all([
    supabase.from("profiles").select("mobile_tabs").eq("id", userId).maybeSingle(),
    tenantId ? supabase.from("tenants").select("mobile_tabs").eq("id", tenantId).maybeSingle() : Promise.resolve({ data: null as any, error: null as any }),
  ]);
  if (pErr) return NextResponse.json({ mine: null, tenant: null, migrationMissing: /mobile_tabs/.test(pErr.message) });

  const mine = cleanKeys((p as any)?.mobile_tabs);
  const rawTenant = (tRes as any)?.data?.mobile_tabs;
  const tenant: Partial<Record<TabRole, string[]>> = {};
  if (rawTenant && typeof rawTenant === "object") {
    for (const r of ["admin", "receptionist", "barber"] as TabRole[]) {
      const k = cleanKeys(rawTenant[r]);
      if (k && k.length) tenant[r] = k;
    }
  }
  return NextResponse.json({ mine: mine && mine.length ? mine : null, tenant: Object.keys(tenant).length ? tenant : null });
}

export async function PUT(req: NextRequest) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const supabase = createAdminSupabase();

  const keys = body.keys === null ? null : cleanKeys(body.keys);
  if (body.keys !== null && (!keys || keys.length === 0)) return NextResponse.json({ error: "Elige al menos un atajo" }, { status: 400 });
  if (keys && keys.length > MAX_TABS) return NextResponse.json({ error: `Máximo ${MAX_TABS} atajos` }, { status: 400 });

  const missingMsg = "Falta aplicar la migración 108 (barra inferior).";

  if (body.scope === "me") {
    // Cada atajo debe ser algo que el rol de la persona puede abrir.
    for (const k of keys || []) {
      const def = TAB_CATALOG.find((t) => t.key === k);
      if (!def || !roleCanSee(def, role)) return NextResponse.json({ error: "Ese atajo no está disponible para tu rol" }, { status: 400 });
    }
    const { error } = await supabase.from("profiles").update({ mobile_tabs: keys }).eq("id", userId);
    if (error) return NextResponse.json({ error: /mobile_tabs/.test(error.message) ? missingMsg : error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.scope === "tenant") {
    if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });
    if (!tenantId) return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
    const target = toTabRole(String(body.role || ""));
    if (!["admin", "receptionist", "barber"].includes(String(body.role))) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
    for (const k of keys || []) {
      const def = TAB_CATALOG.find((t) => t.key === k);
      if (!def || !roleCanSee(def, target)) return NextResponse.json({ error: "Ese atajo no está disponible para ese rol" }, { status: 400 });
    }
    const { data: t, error: rErr } = await supabase.from("tenants").select("mobile_tabs").eq("id", tenantId).maybeSingle();
    if (rErr) return NextResponse.json({ error: /mobile_tabs/.test(rErr.message) ? missingMsg : rErr.message }, { status: 500 });
    const current = (t as any)?.mobile_tabs && typeof (t as any).mobile_tabs === "object" ? { ...(t as any).mobile_tabs } : {};
    if (keys) current[target] = keys; else delete current[target];
    const { error } = await supabase.from("tenants").update({ mobile_tabs: Object.keys(current).length ? current : null }).eq("id", tenantId);
    if (error) return NextResponse.json({ error: /mobile_tabs/.test(error.message) ? missingMsg : error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
}
