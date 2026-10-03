import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { chileDayBoundsUtc, todayInChile } from "@/lib/utils";
import { accountingColumnsAvailable, isMonthClosed, monthEnd, monthFilter, monthLabelEs, monthStart } from "@/lib/accounting";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const barberId = searchParams.get("barberId");
  // "Mes contable": movimientos que corresponden a ese mes (aunque se hayan registrado en otro).
  const month = monthStart(searchParams.get("month"));
  const acc = await accountingColumnsAvailable(supabase);

  let query = supabase
    .from("transactions")
    .select(`
      *,
      client:clients(name),
      barber:profiles(name),
      items:transaction_items(description, total)
    `)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    // Was 100. In a busy shop, manual expenses (luz, arriendo, etc.) got pushed past the
    // 100 most-recent transactions and looked "deleted" even though they were never
    // removed. Raised so a month of activity stays visible. The date filters below narrow
    // it further when the user picks a range.
    .limit(1000);

  // "ALL" means super_admin (no filter, sees every business).
  if (tenantId && tenantId !== "ALL") query = query.eq("tenant_id", tenantId);
  if (type && type !== "ALL") query = query.eq("type", type.toLowerCase());
  if (month) {
    const last = monthEnd(month);
    query = monthFilter(query, acc, {
      first: month, last,
      startIso: chileDayBoundsUtc(month).startUtc,
      endIso: chileDayBoundsUtc(last).endUtc,
    });
  } else {
    if (from) query = query.gte("created_at", new Date(from).toISOString());
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lte("created_at", toDate.toISOString());
    }
  }
  if (barberId) query = query.eq("barber_id", barberId);

  const { data: transactions, error } = await query;
  if (error) {
    console.error("finanzas GET:", error.message);
    return NextResponse.json({ transactions: [], stats: { totalIncome: 0, totalExpenses: 0, balance: 0, transactionCount: 0 } });
  }

  // "Emitido por": nombre de quien registro el movimiento (solo los hechos desde la migracion 090).
  const creatorIds = Array.from(new Set((transactions || []).map((t: any) => t.created_by).filter(Boolean)));
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase.from("profiles").select("id, name").in("id", creatorIds);
    const nameById = new Map((creators || []).map((c: any) => [c.id, c.name]));
    for (const t of transactions as any[]) t.created_by_name = t.created_by ? nameById.get(t.created_by) || null : null;
  }

  // Calculate stats
  const income = (transactions || []).filter((t) => t.type === "income");
  const expenses = (transactions || []).filter((t) => t.type === "expense");
  const totalIncome = income.reduce((s, t) => s + Number(t.total), 0);
  const totalExpenses = expenses.reduce((s, t) => s + Number(t.total), 0);

  // Punto 5 (Pablo): al crear/editar un movimiento manual, permitir elegir a que
  // profesional corresponde. Devuelto junto con la lista de transacciones para no
  // agregar otro round-trip al abrir el modal.
  let barbersQuery = supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "barber")
    .eq("active", true)
    .order("name");
  if (tenantId && tenantId !== "ALL") barbersQuery = barbersQuery.eq("tenant_id", tenantId);
  const { data: barbers } = await barbersQuery;

  return NextResponse.json({
    transactions: transactions || [],
    barbers: barbers || [],
    stats: {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      transactionCount: (transactions || []).length,
    },
  });
}

const ASSIGNED_TO_VALUES = new Set(["professional", "reception", "business"]);

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { type, description, amount, paymentMethod, notes, tenantId: bodyTenantId, assignedTo, barberId, accountingMonth } = body;

  // Resolve tenant: prefer explicit param, fallback to session. Never save a manual
  // income/expense entry without a business, or it becomes invisible in Finanzas.
  let resolvedTenantId = bodyTenantId;
  if (!resolvedTenantId) {
    const { searchParams } = new URL(req.url);
    const { tenantId: resolved } = await resolveTenantForRequest(searchParams.get("tenantId"));
    resolvedTenantId = resolved && resolved !== "ALL" ? resolved : null;
  }
  if (!resolvedTenantId) {
    return NextResponse.json({ error: "No se pudo determinar el negocio para la transaccion." }, { status: 400 });
  }

  // Punto 5 (Pablo): "a quien corresponde" (Profesional/Recepcion/Negocio general).
  // Opcional para no romper otros flujos que sigan llamando a este endpoint sin el
  // campo; un valor invalido se ignora en vez de fallar la transaccion completa.
  const resolvedAssignedTo = ASSIGNED_TO_VALUES.has(assignedTo) ? assignedTo : null;
  const resolvedBarberId = resolvedAssignedTo === "professional" && barberId ? barberId : null;

  // Fecha contable ("Corresponde al mes"): por defecto el mes de hoy. Y quien emite el movimiento.
  const acc = await accountingColumnsAvailable(supabase);
  const base = {
    type: type.toLowerCase(),
    status: "completed",
    subtotal: amount,
    total: amount,
    payment_method: paymentMethod.toLowerCase(),
    notes,
    tenant_id: resolvedTenantId,
    assigned_to: resolvedAssignedTo,
    barber_id: resolvedBarberId,
  };
  const { userId } = await getCurrentUserRoleAndTenant();
  const month = monthStart(accountingMonth) || monthStart(todayInChile());
  // Mes cerrado: no se registran movimientos manuales que correspondan a el (hay que reabrirlo).
  if (acc && month && (await isMonthClosed(supabase, resolvedTenantId, month))) {
    return NextResponse.json({ error: `El mes de ${monthLabelEs(month)} esta cerrado. Reabrelo en Cierre mensual para registrar este movimiento.` }, { status: 409 });
  }
  const row = acc ? { ...base, accounting_month: month, created_by: userId } : base;

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .insert(row)
    .select()
    .single();

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  await supabase.from("transaction_items").insert({
    transaction_id: tx.id,
    description,
    quantity: 1,
    unit_price: amount,
    total: amount,
  });

  return NextResponse.json(tx, { status: 201 });
}
