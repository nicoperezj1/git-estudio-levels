import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { isMonthClosed, monthLabelEs, monthStart } from "@/lib/accounting";
import { computePayslip, paramsMissing } from "@/lib/payroll";
import { autoAmounts, defaultInputs, resolveParams, sanitizeInputs, type FileRow } from "@/lib/payroll-data";

// Liquidacion de sueldo de un trabajador con contrato (solo administrador). El calculo SIEMPRE se hace en el
// servidor con los datos recibidos: el resultado que muestre el navegador nunca se guarda tal cual.
async function admin() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}

async function load(supabase: ReturnType<typeof createAdminSupabase>, tenantId: string, barberId: string, first: string) {
  const [{ data: file }, { data: pro }, { data: saved }] = await Promise.all([
    supabase.from("employee_files").select("*").eq("tenant_id", tenantId).eq("barber_id", barberId).maybeSingle(),
    supabase.from("profiles").select("id, name, work_mode").eq("id", barberId).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("payslips").select("*").eq("tenant_id", tenantId).eq("barber_id", barberId).eq("month", first).maybeSingle(),
  ]);
  return { file: file as FileRow | null, pro: pro as any, saved: saved as any };
}

export async function GET(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const first = monthStart(sp.get("month"));
  const barberId = sp.get("barberId");
  if (!first) return NextResponse.json({ error: "Mes no valido" }, { status: 400 });
  const supabase = createAdminSupabase();

  // Sin barberId: resumen del mes (quien tiene ficha y el estado de su liquidacion).
  if (!barberId) {
    const [{ data: files }, { data: slips }, { data: pros }] = await Promise.all([
      supabase.from("employee_files").select("barber_id, base_salary, contract_type").eq("tenant_id", c.tenantId!),
      supabase.from("payslips").select("barber_id, status, net, total_cost").eq("tenant_id", c.tenantId!).eq("month", first),
      supabase.from("profiles").select("id, name").eq("tenant_id", c.tenantId!),
    ]);
    const name = new Map((pros || []).map((p: any) => [p.id, p.name]));
    const slip = new Map((slips || []).map((s: any) => [s.barber_id, s]));
    return NextResponse.json({
      month: first, monthLabel: monthLabelEs(first), closed: await isMonthClosed(supabase, c.tenantId!, first),
      rows: (files || []).map((f: any) => ({
        barberId: f.barber_id, name: name.get(f.barber_id) || "Trabajador", baseSalary: Number(f.base_salary),
        status: slip.get(f.barber_id)?.status || "none", net: Number(slip.get(f.barber_id)?.net || 0), totalCost: Number(slip.get(f.barber_id)?.total_cost || 0),
      })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    });
  }

  const { file, pro, saved } = await load(supabase, c.tenantId!, barberId, first);
  if (!pro) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });
  if (!file) return NextResponse.json({ error: "Este trabajador no tiene ficha laboral.", needsFile: true }, { status: 409 });

  const { params, source, month: paramsMonth } = await resolveParams(supabase, c.tenantId!, first);
  const auto = await autoAmounts(supabase, c.tenantId!, barberId, first, pro.work_mode);
  const base = defaultInputs(file, auto, first);
  // Si ya hay una liquidacion guardada, sus datos mandan (lo que el administrador ajusto).
  const inputs = saved?.inputs && Object.keys(saved.inputs).length ? sanitizeInputs(saved.inputs, base) : base;
  const result = computePayslip(inputs, params);
  return NextResponse.json({
    name: pro.name, month: first, monthLabel: monthLabelEs(first), status: saved?.status || "none",
    inputs, auto, result, suggestedSemanaCorrida: base.suggestedSemanaCorrida,
    params: { source, paramsMonth, missing: paramsMissing(params) },
    paramsValues: params,
    closed: await isMonthClosed(supabase, c.tenantId!, first),
  });
}

// Guardar borrador (recalcula en el servidor).
export async function POST(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const first = monthStart(body?.month);
  if (!first || !body?.barberId) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { file, pro, saved } = await load(supabase, c.tenantId!, body.barberId, first);
  if (!pro || !file) return NextResponse.json({ error: "Trabajador sin ficha laboral" }, { status: 404 });
  if (saved && saved.status !== "draft") return NextResponse.json({ error: "La liquidación ya fue emitida. Reábrela para cambiarla." }, { status: 409 });

  const { params } = await resolveParams(supabase, c.tenantId!, first);
  if (paramsMissing(params).length) return NextResponse.json({ error: `Faltan parámetros del mes: ${paramsMissing(params).join(", ")}.` }, { status: 409 });
  const auto = await autoAmounts(supabase, c.tenantId!, body.barberId, first, pro.work_mode);
  const inputs = sanitizeInputs(body?.inputs, defaultInputs(file, auto, first));
  const result = computePayslip(inputs, params);
  const row = { tenant_id: c.tenantId, barber_id: body.barberId, month: first, status: "draft", inputs, result, net: result.net, total_cost: result.totalCost, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("payslips").upsert(row, { onConflict: "tenant_id,barber_id,month" });
  if (error) return NextResponse.json({ error: "Falta aplicar la migración 096 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true, result });
}

// Emitir / pagar / reabrir.
export async function PATCH(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const first = monthStart(body?.month);
  const action = body?.action as "issue" | "pay" | "reopen";
  if (!first || !body?.barberId || !["issue", "pay", "reopen"].includes(action)) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: slip } = await supabase.from("payslips").select("*").eq("tenant_id", c.tenantId!).eq("barber_id", body.barberId).eq("month", first).maybeSingle();
  if (!slip) return NextResponse.json({ error: "Primero guarda la liquidación." }, { status: 404 });
  const { data: me } = await supabase.from("profiles").select("name").eq("id", c.userId).maybeSingle();
  const now = new Date().toISOString();

  if (action === "issue") {
    if (slip.status !== "draft") return NextResponse.json({ error: "Ya fue emitida." }, { status: 409 });
    if ((slip.result?.warnings || []).some((w: any) => w.level === "error")) return NextResponse.json({ error: "Corrige los errores antes de emitir." }, { status: 409 });
    await supabase.from("payslips").update({ status: "issued", issued_by_name: me?.name || null, issued_at: now, updated_at: now }).eq("id", slip.id);
    return NextResponse.json({ success: true });
  }
  if (action === "reopen") {
    if (slip.status !== "issued") return NextResponse.json({ error: slip.status === "paid" ? "Una liquidación pagada ya quedó en la contabilidad y no se reabre." : "Ya es borrador." }, { status: 409 });
    await supabase.from("payslips").update({ status: "draft", updated_at: now }).eq("id", slip.id);
    return NextResponse.json({ success: true });
  }
  // pay: el liquido entra como egreso "Remuneraciones" del mes (para el cierre mensual).
  if (slip.status !== "issued") return NextResponse.json({ error: "Primero emite la liquidación." }, { status: 409 });
  if (await isMonthClosed(supabase, c.tenantId!, first)) return NextResponse.json({ error: "El mes está cerrado. Reábrelo en el Cierre Mensual para registrar el pago." }, { status: 409 });
  const { data: pro } = await supabase.from("profiles").select("name").eq("id", body.barberId).maybeSingle();
  const amount = Math.round(Number(slip.net));
  const desc = `Remuneraciones - ${pro?.name || "Trabajador"} (${monthLabelEs(first)})`;
  let txId: string | null = slip.expense_tx_id || null;
  if (!txId) {
    const { data: tx, error } = await supabase.from("transactions").insert({
      type: "expense", status: "completed", subtotal: amount, total: amount, payment_method: "transfer", notes: desc,
      tenant_id: c.tenantId, assigned_to: "business", accounting_month: first, created_by: c.userId,
    }).select("id").single();
    if (error || !tx) return NextResponse.json({ error: error?.message || "No se pudo registrar el egreso" }, { status: 500 });
    txId = tx.id;
    await supabase.from("transaction_items").insert({ transaction_id: txId, description: desc, quantity: 1, unit_price: amount, total: amount });
  }
  await supabase.from("payslips").update({ status: "paid", paid_at: now, expense_tx_id: txId, updated_at: now }).eq("id", slip.id);
  return NextResponse.json({ success: true, expenseId: txId });
}
