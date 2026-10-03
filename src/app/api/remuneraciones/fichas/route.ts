import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Ficha laboral de los trabajadores CON contrato (solo administrador). Tener ficha marca al profesional
// como "con contrato" (profiles.has_labor_contract), que activa el aviso de 15% en descuentos por planilla.
async function admin() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}
const num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

export async function GET() {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { data: pros } = await supabase.from("profiles").select("id, name, role, work_mode, also_attends_clients")
    .eq("tenant_id", c.tenantId!).eq("active", true).in("role", ["barber", "receptionist", "admin"]).order("name");
  const { data: files, error } = await supabase.from("employee_files").select("*").eq("tenant_id", c.tenantId!);
  const byId = new Map((files || []).map((f: any) => [f.barber_id, f]));
  return NextResponse.json({
    team: (pros || []).map((p: any) => ({ id: p.id, name: p.name, role: p.role, workMode: p.work_mode, file: byId.get(p.id) || null })),
    migrationMissing: !!error && /does not exist|schema cache/i.test(error.message),
  });
}

export async function PUT(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const f = body?.file || {};
  if (!body?.barberId) return NextResponse.json({ error: "Falta el trabajador" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: pro } = await supabase.from("profiles").select("id").eq("id", body.barberId).eq("tenant_id", c.tenantId!).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });
  const contract = ["indefinido", "plazo_fijo", "obra"].includes(f.contract_type) ? f.contract_type : "indefinido";
  const health = f.health_system === "isapre" ? "isapre" : "fonasa";
  const gmode = ["auto", "manual", "none"].includes(f.gratification_mode) ? f.gratification_mode : "auto";
  const hire = typeof f.hire_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.hire_date) ? f.hire_date : null;
  const row = {
    tenant_id: c.tenantId, barber_id: body.barberId, contract_type: contract, hire_date: hire,
    weekly_hours: num(f.weekly_hours, 44) || 44, base_salary: Math.round(num(f.base_salary)),
    afp_name: String(f.afp_name || "").slice(0, 40) || null, afp_rate: Math.min(100, num(f.afp_rate)),
    health_system: health, isapre_plan_uf: health === "isapre" ? num(f.isapre_plan_uf) : null,
    colacion: Math.round(num(f.colacion)), movilizacion: Math.round(num(f.movilizacion)),
    gratification_mode: gmode, updated_at: new Date().toISOString(),
    rut: String(f.rut || "").trim().slice(0, 20) || null, position: String(f.position || "").trim().slice(0, 60) || null,
    cost_center: String(f.cost_center || "").trim().slice(0, 60) || null,
  };
  let { error } = await supabase.from("employee_files").upsert(row, { onConflict: "tenant_id,barber_id" });
  if (error && /rut|position|cost_center/i.test(error.message)) {
    // 096 vieja (sin RUT/cargo): se guarda sin esos campos.
    const { rut, position, cost_center, ...legacy } = row as any;
    ({ error } = await supabase.from("employee_files").upsert(legacy, { onConflict: "tenant_id,barber_id" }));
  }
  if (error) return NextResponse.json({ error: "Falta aplicar la migración 096 en la base de datos." }, { status: 409 });
  await supabase.from("profiles").update({ has_labor_contract: true }).eq("id", body.barberId); // ignora si 094 no esta
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const barberId = new URL(req.url).searchParams.get("barberId");
  if (!barberId) return NextResponse.json({ error: "Falta el trabajador" }, { status: 400 });
  const supabase = createAdminSupabase();
  await supabase.from("employee_files").delete().eq("tenant_id", c.tenantId!).eq("barber_id", barberId);
  await supabase.from("profiles").update({ has_labor_contract: false }).eq("id", barberId).eq("tenant_id", c.tenantId!);
  return NextResponse.json({ success: true });
}
