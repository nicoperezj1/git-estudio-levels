import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile, chileDayBoundsUtc } from "@/lib/utils";
import { tenantHasFeature } from "@/lib/plan-features";
import { getWithdrawals, getCashCap, getAdjustments } from "@/lib/cash-withdrawals";

// GET: Current day's cash register status + transactions
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  // Punto 1 (Nico): "hoy" debe ser el dia calendario de Chile, no el UTC del server.
  const date = searchParams.get("date") || todayInChile();

  // Get register for this date, scoped to the caller's business. Without this, two
  // businesses opening a register on the same day would collide (see migration 053).
  let registerQuery = supabase
    .from("cash_register")
    .select("*, opened_by_profile:profiles!cash_register_opened_by_fkey(name), closed_by_profile:profiles!cash_register_closed_by_fkey(name)")
    .eq("date", date);
  if (tenantId && tenantId !== "ALL") registerQuery = registerQuery.eq("tenant_id", tenantId);
  const { data: register } = await registerQuery.maybeSingle();

  // Get today's cash transactions. Bounds computed against Chile's real midnight (not a
  // naive date-string range, which Postgres would read in its own session timezone).
  const { startUtc: dayStart, endUtc: dayEnd } = chileDayBoundsUtc(date);

  // Enriched breakdown for the "Movimientos del dia" table: who did it (barber), what
  // (service/item descriptions), the tip, plus the amount/method/time. This is what
  // lets the daily cash count be reconciled inside re-booking instead of a side Excel.
  const txSelect = (extra: string) =>
    `id, type, total, payment_method, notes, created_at, tip_amount, barber_id${extra}, barber:profiles(name, work_mode, rental_cash_to_barber), items:transaction_items(description)`;
  const runTx = (extra: string) => {
    let q = supabase
      .from("transactions")
      .select(txSelect(extra))
      .eq("status", "completed")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .order("created_at", { ascending: true });
    if (tenantId && tenantId !== "ALL") q = q.eq("tenant_id", tenantId);
    return q;
  };
  // Con quien emitio cada movimiento y desde donde (created_by / origin: migraciones 090 y 097). Si alguna aun no esta
  // aplicada, se pide sin esos datos para que la caja nunca quede en blanco.
  let { data: transactionsRaw, error: txErr } = await runTx(", created_by, origin");
  if (txErr) ({ data: transactionsRaw, error: txErr } = await runTx(", created_by"));
  if (txErr) ({ data: transactionsRaw } = await runTx(""));

  // Nombres de quienes emitieron (created_by no tiene llave hacia profiles: se buscan aparte).
  const issuerIds = Array.from(new Set((transactionsRaw || []).map((t: any) => t.created_by).filter(Boolean)));
  const issuerNames = new Map<string, string>();
  if (issuerIds.length > 0) {
    const { data: issuers } = await supabase.from("profiles").select("id, name").in("id", issuerIds);
    for (const i of (issuers || []) as any[]) issuerNames.set(i.id, i.name);
  }

  // Bug (reportado por Nico, 26-sep): un cobro dividido (ej. debito + efectivo) guarda
  // payment_method = "mixed" en transactions (ver /api/pos/checkout), y el detalle real
  // por metodo vive aparte en transaction_payments. Como el calculo de caja filtraba
  // solo payment_method === "cash", la parte en efectivo de un cobro dividido quedaba
  // afuera por completo de la cuadratura. Se resuelve trayendo, para las transacciones
  // "mixed" del dia, cuanto de cada una fue efectivo.
  const mixedIds = (transactionsRaw || [])
    .filter((t: any) => t.payment_method === "mixed")
    .map((t: any) => t.id);
  const mixedCashById = new Map<string, number>();
  if (mixedIds.length > 0) {
    const { data: splitRows } = await supabase
      .from("transaction_payments")
      .select("transaction_id, payment_method, amount")
      .in("transaction_id", mixedIds)
      .eq("payment_method", "cash");
    for (const row of splitRows || []) {
      mixedCashById.set(row.transaction_id, (mixedCashById.get(row.transaction_id) || 0) + Number(row.amount));
    }
  }
  const cashAmountOf = (t: any) => (t.payment_method === "mixed" ? (mixedCashById.get(t.id) || 0) : Number(t.total));

  // Flatten barber name + join item descriptions into a single "services" string.
  // `barberTakesCash` = a rental barber who pockets their own cash: their cash sales
  // never enter the salon's till, so they must be excluded from the expected cash count.
  const transactions = (transactionsRaw || []).map((t: any) => ({
    id: t.id,
    type: t.type,
    total: t.total,
    payment_method: t.payment_method,
    cashAmount: cashAmountOf(t),
    notes: t.notes,
    created_at: t.created_at,
    tip_amount: t.tip_amount || 0,
    barber_id: t.barber_id,
    issuedByName: t.created_by ? issuerNames.get(t.created_by) || null : null,
    origin: t.origin || null,
    barberName: t.barber?.name || null,
    barberTakesCash: t.barber?.work_mode === "rental" && !!t.barber?.rental_cash_to_barber,
    services: Array.isArray(t.items) ? t.items.map((i: any) => i.description).filter(Boolean).join(", ") : "",
  }));

  const isCashLike = (t: any) => t.payment_method === "cash" || (t.payment_method === "mixed" && t.cashAmount > 0);

  // Calculate cash movements. Exclude cash from rental barbers who take their own cash —
  // that money is theirs and never goes into the salon till, so counting it would make
  // the till look short every day. For "mixed" (split) sales, only the cash portion
  // counts, not the full total.
  const cashIncome = (transactions || [])
    .filter((t) => t.type === "income" && isCashLike(t) && !t.barberTakesCash)
    .reduce((sum, t) => sum + Number(t.cashAmount), 0);

  // Cash that a rental barber pocketed directly (informational — shown separately, NOT
  // part of the salon's expected till).
  const rentalCashToBarber = (transactions || [])
    .filter((t) => t.type === "income" && isCashLike(t) && t.barberTakesCash)
    .reduce((sum, t) => sum + Number(t.cashAmount), 0);

  const cashExpense = (transactions || [])
    .filter((t) => t.type === "expense" && isCashLike(t))
    .reduce((sum, t) => sum + Number(t.cashAmount), 0);

  const cardIncome = (transactions || [])
    .filter((t) => t.type === "income" && t.payment_method !== "cash")
    .reduce((sum, t) => sum + (t.payment_method === "mixed" ? Number(t.total) - Number(t.cashAmount) : Number(t.total)), 0);

  const totalIncome = (transactions || [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.total), 0);

  const totalExpense = (transactions || [])
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.total), 0);

  const openingAmount = register ? Number(register.opening_amount) : 0;
  // Retiros a la caja fuerte (reduccion de efectivo): salen de la caja, asi que se restan.
  const specific = !!tenantId && tenantId !== "ALL";
  const wd = specific ? await getWithdrawals(supabase, tenantId as string, date) : { total: 0, rows: [] };
  const cashCap = specific ? await getCashCap(supabase, tenantId as string) : null;
  // Ajustes de caja: lo que el administrador declaro como efectivo real al revisar un reporte (puede sumar o restar).
  const adj = specific ? await getAdjustments(supabase, tenantId as string, date) : { total: 0, rows: [] };
  const expectedCash = openingAmount + cashIncome - cashExpense - wd.total + adj.total;

  return NextResponse.json({
    register: register || null,
    isOpen: register?.status === "open",
    summary: {
      openingAmount,
      cashIncome,
      cashExpense,
      cardIncome,
      totalIncome,
      totalExpense,
      expectedCash,
      rentalCashToBarber, // cash pocketed by rental barbers, NOT in the salon till
      withdrawalsTotal: wd.total,
      adjustmentsTotal: adj.total,
      cashCap, // tope de efectivo del negocio (null = sin tope)
      transactionCount: (transactions || []).length,
    },
    transactions: transactions || [],
    withdrawals: wd.rows,
    adjustments: adj.rows,
  });
}

// POST: Open register
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: se podia abrir la caja
  // de otro negocio. Ahora hace falta sesion y el negocio sale de la sesion (salvo super_admin).
  const caller = await getCurrentUserRoleAndTenant();
  if (!caller.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { openingAmount, userId, tenantId: bodyTenantId } = body;

  // Resolve tenant: prefer explicit param, fallback to session.
  const { searchParams: sp } = new URL(req.url);
  const { tenantId: resolvedT } = await resolveTenantForRequest(bodyTenantId || sp.get("tenantId"));
  let tenantId: string | null = resolvedT && resolvedT !== "ALL" ? resolvedT : null;
  if (!tenantId) {
    return NextResponse.json({ error: "No se pudo determinar el negocio para abrir la caja." }, { status: 400 });
  }

  // Item 34 (Nico, 26-sep): "Modulo de caja" es una feature de plan (Pro+) — el sidebar ya
  // la oculta/bloquea, esto es la verificacion del lado del servidor para que no se pueda
  // abrir una caja igual llamando directo a la API.
  if (!(await tenantHasFeature(tenantId, "cash_register"))) {
    return NextResponse.json({ error: "El Modulo de Caja no esta incluido en tu plan actual. Mejora tu plan para usarlo." }, { status: 403 });
  }

  const today = todayInChile();

  // Check if THIS business already opened a register today (was checking globally,
  // which blocked every other business from opening theirs — see migration 053).
  const { data: existing } = await supabase
    .from("cash_register")
    .select("id")
    .eq("date", today)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "La caja de hoy ya fue abierta" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("cash_register")
    .insert({
      date: today,
      opening_amount: openingAmount || 0,
      opened_by: userId || null,
      status: "open",
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH: Close register
export async function PATCH(req: NextRequest) {
  // SEGURIDAD: igual que al abrir, hace falta sesion y el negocio sale de la sesion.
  const caller = await getCurrentUserRoleAndTenant();
  if (!caller.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { closingAmount, userId, notes, tenantId: bodyTenantId } = body;

  // Resolve tenant: prefer explicit param, fallback to session.
  const { searchParams: sp } = new URL(req.url);
  const { tenantId: resolvedT } = await resolveTenantForRequest(bodyTenantId || sp.get("tenantId"));
  let tenantId: string | null = resolvedT && resolvedT !== "ALL" ? resolvedT : null;
  if (!tenantId) {
    return NextResponse.json({ error: "No se pudo determinar el negocio para cerrar la caja." }, { status: 400 });
  }

  const today = todayInChile();

  // Get THIS business's open register for today.
  const { data: register } = await supabase
    .from("cash_register")
    .select("*")
    .eq("date", today)
    .eq("status", "open")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!register) {
    return NextResponse.json({ error: "No hay caja abierta para hoy" }, { status: 404 });
  }

  // Calculate expected — only THIS business's transactions, bounded to Chile's real
  // midnight-to-midnight for "today" (not a naive date-string range).
  const { startUtc: dayStart, endUtc: dayEnd } = chileDayBoundsUtc(today);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, type, total, payment_method, barber:profiles(work_mode, rental_cash_to_barber)")
    .eq("status", "completed")
    .eq("tenant_id", tenantId)
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd);

  // Mismo fix que en el GET: un cobro dividido guarda payment_method = "mixed" y su
  // detalle real por metodo vive en transaction_payments, asi que hay que traerlo aparte
  // para no dejar la parte en efectivo fuera del cierre de caja.
  const mixedIds = (transactions || [])
    .filter((t: any) => t.payment_method === "mixed")
    .map((t: any) => t.id);
  const mixedCashById = new Map<string, number>();
  if (mixedIds.length > 0) {
    const { data: splitRows } = await supabase
      .from("transaction_payments")
      .select("transaction_id, amount")
      .in("transaction_id", mixedIds)
      .eq("payment_method", "cash");
    for (const row of splitRows || []) {
      mixedCashById.set(row.transaction_id, (mixedCashById.get(row.transaction_id) || 0) + Number(row.amount));
    }
  }
  const cashAmountOf = (t: any) => (t.payment_method === "mixed" ? (mixedCashById.get(t.id) || 0) : Number(t.total));
  const isCashLike = (t: any) => t.payment_method === "cash" || (t.payment_method === "mixed" && cashAmountOf(t) > 0);

  // Same exclusion as the GET summary: cash pocketed directly by a rental barber never
  // entered the till, so it must not be part of the expected amount at close.
  const barberTakesCash = (t: any) => t.barber?.work_mode === "rental" && !!t.barber?.rental_cash_to_barber;

  const cashIncome = (transactions || [])
    .filter((t: any) => t.type === "income" && isCashLike(t) && !barberTakesCash(t))
    .reduce((sum: number, t: any) => sum + Number(cashAmountOf(t)), 0);

  const cashExpense = (transactions || [])
    .filter((t: any) => t.type === "expense" && isCashLike(t))
    .reduce((sum: number, t: any) => sum + Number(cashAmountOf(t)), 0);

  const closeWd = await getWithdrawals(supabase, tenantId, today);
  const closeAdj = await getAdjustments(supabase, tenantId, today);
  const expectedAmount = Number(register.opening_amount) + cashIncome - cashExpense - closeWd.total + closeAdj.total;
  const difference = (closingAmount || 0) - expectedAmount;

  const { data, error } = await supabase
    .from("cash_register")
    .update({
      closing_amount: closingAmount,
      expected_amount: expectedAmount,
      difference,
      closed_by: userId || null,
      status: "closed",
      closed_at: new Date().toISOString(),
      notes: notes || null,
    })
    .eq("id", register.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
