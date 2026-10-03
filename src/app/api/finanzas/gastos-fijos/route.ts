import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { chileDayBoundsUtc } from "@/lib/utils";
import {
  FIXED_CATEGORIES, accountingColumnsAvailable, fetchAllRows, isMonthClosed, monthEnd, monthFilter, monthLabelEs, monthStart,
} from "@/lib/accounting";

// Gastos fijos del mes (impuestos, comision maquina, arriendo, insumos, luz, publicidad, honorarios,
// equipamiento). Se ingresan desde cero cada mes. Se guardan como EGRESOS normales (con
// fixed_category y fecha contable del mes), asi aparecen solos en Ingresos y egresos, en el cierre
// mensual y en los informes, sin sumarse dos veces. Metodo "transferencia": no tocan la Caja diaria.
// Solo administrador.

async function requireAdmin() {
  const { role, tenantId: callerTenant, userId } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const;
  return { role, callerTenant, userId } as const;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const month = monthStart(searchParams.get("month"));
  if (denied || !tenantId || tenantId === "ALL" || !month) {
    return NextResponse.json({ error: "Negocio o mes no valido" }, { status: 400 });
  }

  const acc = await accountingColumnsAvailable(supabase);
  if (!acc) return NextResponse.json({ available: false, items: [], machine: null, closed: false });

  const { data: rows } = await supabase
    .from("transactions").select("fixed_category, total")
    .eq("tenant_id", tenantId).eq("accounting_month", month).eq("status", "completed").not("fixed_category", "is", null);
  const byCat = new Map((rows || []).map((r: any) => [r.fixed_category, Number(r.total)]));
  const items = FIXED_CATEGORIES.map((c) => ({ key: c.key, label: c.label, amount: byCat.get(c.key) || 0 }));

  // Ayuda para "Comision maquina": lo vendido en el mes con debito y con credito (incluye pagos divididos).
  const last = monthEnd(month);
  const range = { first: month, last, startIso: chileDayBoundsUtc(month).startUtc, endIso: chileDayBoundsUtc(last).endUtc };
  let debit = 0, credit = 0;
  try {
    const income = await fetchAllRows<any>(() =>
      monthFilter(supabase.from("transactions").select("id, total, payment_method")
        .eq("tenant_id", tenantId).eq("type", "income").eq("status", "completed"), true, range));
    const mixedIds: string[] = [];
    for (const t of income) {
      if (t.payment_method === "debit_card") debit += Number(t.total);
      else if (t.payment_method === "credit_card") credit += Number(t.total);
      else if (t.payment_method === "mixed") mixedIds.push(t.id);
    }
    for (let i = 0; i < mixedIds.length; i += 200) {
      const { data: parts } = await supabase.from("transaction_payments").select("payment_method, amount").in("transaction_id", mixedIds.slice(i, i + 200));
      for (const p of parts || []) {
        if (p.payment_method === "debit_card") debit += Number(p.amount);
        else if (p.payment_method === "credit_card") credit += Number(p.amount);
      }
    }
  } catch (e) {
    console.error("gastos-fijos machine help:", e);
  }

  return NextResponse.json({
    available: true, items, machine: { debit, credit }, closed: await isMonthClosed(supabase, tenantId, month),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const body = await req.json().catch(() => null);
  const month = monthStart(body?.month);
  if (denied || !tenantId || tenantId === "ALL" || !month || !Array.isArray(body?.items)) {
    return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  }
  if (!(await accountingColumnsAvailable(supabase))) {
    return NextResponse.json({ error: "Falta aplicar la migracion 090 en la base de datos." }, { status: 409 });
  }
  if (await isMonthClosed(supabase, tenantId, month)) {
    return NextResponse.json({ error: `El mes de ${monthLabelEs(month)} esta cerrado. Reabrelo para modificar los gastos del mes.` }, { status: 409 });
  }

  for (const it of body.items) {
    const cat = FIXED_CATEGORIES.find((c) => c.key === it?.category);
    const amount = Math.round(Number(it?.amount));
    if (!cat || !Number.isFinite(amount) || amount < 0) continue;

    const { data: existing } = await supabase
      .from("transactions").select("id")
      .eq("tenant_id", tenantId).eq("accounting_month", month).eq("fixed_category", cat.key).eq("status", "completed")
      .limit(1).maybeSingle();

    if (amount === 0) {
      // Sin monto: si habia uno guardado, se anula (queda en la base, como el resto de las anulaciones).
      if (existing) await supabase.from("transactions").update({ status: "cancelled" }).eq("id", existing.id);
      continue;
    }

    const description = cat.label;
    if (existing) {
      await supabase.from("transactions").update({ subtotal: amount, total: amount }).eq("id", existing.id);
      await supabase.from("transaction_items").update({ unit_price: amount, total: amount, description }).eq("transaction_id", existing.id);
    } else {
      const { data: tx, error } = await supabase.from("transactions").insert({
        type: "expense", status: "completed", subtotal: amount, total: amount,
        payment_method: "transfer", notes: `Gasto del mes ${monthLabelEs(month)}`,
        tenant_id: tenantId, assigned_to: "business",
        accounting_month: month, created_by: auth.userId, fixed_category: cat.key,
      }).select("id").single();
      if (error || !tx) return NextResponse.json({ error: error?.message || "No se pudo guardar" }, { status: 500 });
      await supabase.from("transaction_items").insert({ transaction_id: tx.id, description, quantity: 1, unit_price: amount, total: amount });
    }
  }

  return NextResponse.json({ success: true });
}
