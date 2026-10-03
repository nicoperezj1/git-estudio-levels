import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { monthStart } from "@/lib/accounting";
import { resolveParams, sanitizeParams } from "@/lib/payroll-data";
import { paramsMissing } from "@/lib/payroll";

// Parametros del mes (UF, UTM, sueldo minimo, topes, tasas, tramos del impuesto). Los carga el administrador
// del negocio; el super admin puede cargarlos UNA vez para todos (global=true) y los negocios los heredan.
async function ctx() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || (!c.tenantId && c.role !== "super_admin")) return null;
  return c;
}

export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const month = monthStart(new URL(req.url).searchParams.get("month"));
  if (!month) return NextResponse.json({ error: "Mes no valido" }, { status: 400 });
  const supabase = createAdminSupabase();
  if (!c.tenantId) return NextResponse.json({ params: null, source: null, missing: [] });
  const r = await resolveParams(supabase, c.tenantId, month);
  return NextResponse.json({ ...r, missing: paramsMissing(r.params), isSuper: c.role === "super_admin" });
}

export async function PUT(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const month = monthStart(body?.month);
  if (!month) return NextResponse.json({ error: "Mes no valido" }, { status: 400 });
  const global = body?.global === true;
  if (global && c.role !== "super_admin") return NextResponse.json({ error: "Solo el super admin puede cargar parametros globales" }, { status: 403 });
  const tenantId = global ? null : c.tenantId;
  if (!global && !tenantId) return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const supabase = createAdminSupabase();
  const params = sanitizeParams(body?.params);
  const { data: me } = await supabase.from("profiles").select("name").eq("id", c.userId).maybeSingle();
  // Un registro por (negocio o global, mes): se busca y se actualiza o se crea.
  let q = supabase.from("payroll_params").select("id").eq("month", month);
  q = tenantId ? q.eq("tenant_id", tenantId) : q.is("tenant_id", null);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) return NextResponse.json({ error: "Falta aplicar la migración 096 en la base de datos." }, { status: 409 });
  const row = { params, updated_by_name: me?.name || null, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from("payroll_params").update(row).eq("id", (existing as any).id)
    : await supabase.from("payroll_params").insert({ ...row, tenant_id: tenantId, month });
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ success: true, missing: paramsMissing(params) });
}
