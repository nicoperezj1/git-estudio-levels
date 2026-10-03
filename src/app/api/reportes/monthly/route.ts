import { accountingColumnsAvailable, fetchMonthTx } from "@/lib/accounting";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile, chileDayBoundsUtc } from "@/lib/utils";

// Punto 17 (Pablo): "profesionales duplicados en el cierre mensual" — al recrear una
// cuenta durante pruebas queda un profile_id viejo (desactivado) y uno nuevo, ambos con
// el mismo nombre, y el cierre los mostraba como dos filas separadas. No hay forma
// segura de fusionar los ids en la base de datos sin arriesgar historial, asi que se
// agrupa la vista del reporte por nombre normalizado (sin acentos/mayusculas), sumando
// el historial de todos los profile_id que compartan nombre.
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Una lista larga de ids en .in() supera el largo maximo de la URL y devolvia vacio en
// silencio con cientos de ventas al mes: se consulta por lotes.
async function inChunks(ids: string[], fetcher: (chunk: string[]) => PromiseLike<{ data: any[] | null }>, size = 100): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data } = await fetcher(ids.slice(i, i + size));
    if (data) out.push(...data);
  }
  return out;
}

export async function GET(req: NextRequest) {
  // Business-wide financials: owners/managers only. A professional must never pull the
  // whole salon's income from here (they were seeing it via the UI before the fix).
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  // Punto 1 (Nico): "mes actual" por defecto debe ser el mes calendario de Chile, no el
  // UTC del server (afectaba el cierre mensual cerca de fin de mes).
  const [chileYear, chileMonth] = todayInChile().split("-").map(Number);
  const month = parseInt(searchParams.get("month") || String(chileMonth));
  const year = parseInt(searchParams.get("year") || String(chileYear));

  // Month bounds as Chile midnight-to-midnight UTC instants (not naive local-Date
  // construction, which used the server's own UTC offset for the boundary).
  const firstDayStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const startDate = chileDayBoundsUtc(firstDayStr).startUtc;
  const endDate = chileDayBoundsUtc(lastDayStr).endUtc; // exclusive upper bound
  // "ALL" means super_admin (no filter, sees every business). Only apply the filter
  // when there's a real tenant id, otherwise .eq("tenant_id","ALL") matches nothing
  // and every card shows $0 for super_admin.
  const tf = (q: any) => (tenantId && tenantId !== "ALL") ? q.eq("tenant_id", tenantId) : q;

  // Ingresos y egresos por fecha contable ("Corresponde al mes"); ver src/lib/accounting.ts.
  const acc = await accountingColumnsAvailable(supabase);
  const mr = { first: firstDayStr, last: lastDayStr, startIso: startDate, endIso: endDate };

  // Income / expense transactions (todas las filas, por fecha contable)
  const incomeTx = await fetchMonthTx(supabase, { select: "total, payment_method, barber_id", type: "income", range: mr, scope: tf, acc });
  const expenseTx = await fetchMonthTx(supabase, { select: "id, total", type: "expense", range: mr, scope: tf, acc });

  const totalIncome = (incomeTx || []).reduce((s: number, t: any) => s + Number(t.total), 0);
  const totalExpenses = (expenseTx || []).reduce((s: number, t: any) => s + Number(t.total), 0);

  // Appointments completed
  const { count: appointmentsCompleted } = await tf(supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("date", firstDayStr)
    .lte("date", lastDayStr));

  // New clients
  const { count: newClients } = await tf(supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startDate)
    .lt("created_at", endDate));

  // Income by payment method
  const methodMap: Record<string, { total: number; count: number }> = {};
  for (const t of incomeTx || []) {
    const m = t.payment_method;
    if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
    methodMap[m].total += Number(t.total);
    methodMap[m].count++;
  }

  // Income by barber
  const barberMap: Record<string, { total: number; count: number }> = {};
  for (const t of incomeTx || []) {
    if (!t.barber_id) continue;
    if (!barberMap[t.barber_id]) barberMap[t.barber_id] = { total: 0, count: 0 };
    barberMap[t.barber_id].total += Number(t.total);
    barberMap[t.barber_id].count++;
  }

  // Get barber names and work mode
  const barberIds = Object.keys(barberMap);
  let barberProfiles: Record<string, { name: string; work_mode: string; active: boolean }> = {};
  if (barberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, work_mode, active")
      .in("id", barberIds);
    barberProfiles = Object.fromEntries((profiles || []).map((p) => [p.id, { name: p.name, work_mode: p.work_mode || "commission", active: p.active !== false }]));
  }

  // Punto 17: agrupar por nombre normalizado para no mostrar la misma persona dos veces
  // cuando su cuenta fue recreada (id viejo desactivado + id nuevo). Se prefiere el modo
  // de trabajo del profile activo; si ninguno esta activo, se usa el primero encontrado.
  const nameGroups: Record<string, { name: string; total: number; count: number; workMode: string; hasActive: boolean }> = {};
  for (const [id, v] of Object.entries(barberMap)) {
    const profile = barberProfiles[id];
    const displayName = profile?.name || "Desconocido";
    const key = normalizeName(displayName);
    if (!nameGroups[key]) {
      nameGroups[key] = { name: displayName, total: 0, count: 0, workMode: profile?.work_mode || "commission", hasActive: false };
    }
    nameGroups[key].total += v.total;
    nameGroups[key].count += v.count;
    if (profile?.active) {
      nameGroups[key].workMode = profile.work_mode;
      nameGroups[key].hasActive = true;
    }
  }

  // Separate income by work mode
  let incomeCommission = 0;
  let incomeRental = 0;
  for (const [id, v] of Object.entries(barberMap)) {
    const mode = barberProfiles[id]?.work_mode || "commission";
    if (mode === "rental") {
      incomeRental += v.total;
    } else {
      incomeCommission += v.total;
    }
  }
  // Add transactions without barber to commission (house sales)
  const noBarberIncome = (incomeTx || []).filter((t: any) => !t.barber_id).reduce((s: number, t: any) => s + Number(t.total), 0);
  incomeCommission += noBarberIncome;

  // transaction_items has NO tenant_id column, so it must be scoped through the
  // transactions of THIS business/period. Without this, "Top servicios" and "Top
  // productos" mixed sale items from every business. Get this tenant's transaction ids
  // first and filter items by them.
  const { data: tenantTxIds } = await tf(supabase
    .from("transactions")
    .select("id")
    .eq("status", "completed")
    .gte("created_at", startDate)
    .lt("created_at", endDate));
  const txIdList = (tenantTxIds || []).map((t: any) => t.id);

  // Top services (from transaction_items via this tenant's transactions)
  const svcMap: Record<string, { total: number; count: number }> = {};
  const prodMap: Record<string, { total: number; count: number }> = {};

  if (txIdList.length > 0) {
    const serviceItems = await inChunks(txIdList, (c) => supabase
      .from("transaction_items")
      .select("description, total, quantity, service_id, transaction_id")
      .not("service_id", "is", null)
      .in("transaction_id", c));

    for (const item of serviceItems || []) {
      if (!svcMap[item.description]) svcMap[item.description] = { total: 0, count: 0 };
      svcMap[item.description].total += Number(item.total);
      svcMap[item.description].count += item.quantity;
    }

    const productItems = await inChunks(txIdList, (c) => supabase
      .from("transaction_items")
      .select("description, total, quantity, product_id, transaction_id")
      .not("product_id", "is", null)
      .in("transaction_id", c));

    for (const item of productItems || []) {
      if (!prodMap[item.description]) prodMap[item.description] = { total: 0, count: 0 };
      prodMap[item.description].total += Number(item.total);
      prodMap[item.description].count += item.quantity;
    }
  }

  // Punto 18 (Pablo): "incorporar egresos manuales al cierre mensual" — el total ya
  // incluia los egresos manuales (electricidad, arriendo, sueldos, insumos, bebidas,
  // etc.), pero el cierre solo mostraba una cifra global sin poder ver de que se
  // componia. Se agrega el detalle agrupado por descripcion, igual que Top
  // servicios/productos, para que se vea el movimiento financiero completo.
  const expenseMap: Record<string, { total: number; count: number }> = {};
  const expenseTxIds = new Set((expenseTx || []).map((t: any) => t.id));
  if (expenseTxIds.size > 0) {
    const expenseItems = await inChunks(Array.from(expenseTxIds) as string[], (c) => supabase
      .from("transaction_items")
      .select("description, total, transaction_id")
      .in("transaction_id", c));

    for (const item of expenseItems || []) {
      const label = item.description || "Otro egreso";
      if (!expenseMap[label]) expenseMap[label] = { total: 0, count: 0 };
      expenseMap[label].total += Number(item.total);
      expenseMap[label].count++;
    }
  }

  return NextResponse.json({
    period: { month, year },
    summary: {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      incomeCommission,
      incomeRental,
      salonNetIncome: incomeCommission - totalExpenses, // lo que queda para la barberia
      totalTransactions: (incomeTx?.length || 0) + (expenseTx?.length || 0),
      appointmentsCompleted: appointmentsCompleted || 0,
      newClients: newClients || 0,
    },
    incomeByMethod: Object.entries(methodMap).map(([method, v]) => ({
      method, ...v,
    })),
    topServices: Object.entries(svcMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    topProducts: Object.entries(prodMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    incomeByBarber: Object.values(nameGroups)
      .map(({ name, total, count, workMode }) => ({ name, total, count, workMode }))
      .sort((a, b) => b.total - a.total),
    expensesDetail: Object.entries(expenseMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),
  });
}
