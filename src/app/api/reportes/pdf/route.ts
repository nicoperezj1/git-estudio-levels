import { accountingColumnsAvailable, fetchMonthTx } from "@/lib/accounting";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile, chileDayBoundsUtc } from "@/lib/utils";

// Reads from the DB and must never be prerendered/baked at build time.
export const dynamic = "force-dynamic";

// Punto 17 (Pablo): mismo criterio que /api/reportes/monthly — agrupar por nombre
// normalizado para no listar dos veces a un profesional cuya cuenta fue recreada.
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Trae filas por lotes: una lista larga de ids en un .in() revienta el largo maximo de la URL
// (un mes con cientos de ventas devolvia vacio en silencio).
async function inChunks<T = any>(ids: string[], fetcher: (chunk: string[]) => PromiseLike<{ data: T[] | null }>, size = 100): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data } = await fetcher(ids.slice(i, i + size));
    if (data) out.push(...data);
  }
  return out;
}

const esc = (v: any) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SOURCE_LABELS: Record<string, string> = {
  link: "Reserva por link", walk_in: "Pasó por fuera", instagram: "Instagram", tiktok: "TikTok",
  facebook: "Facebook", referral: "Referido de un amigo/conocido",
  google_maps: "Google Maps", promotion: "Promoción", influencer: "Influencer",
  manual: "Agendado manualmente", unknown: "Sin registrar",
};

const CL_TZ = "America/Santiago";

// Reporte del cierre mensual en HTML listo para imprimir / guardar como PDF.
export async function GET(req: NextRequest) {
  // Owners/managers only — same gate as the monthly report JSON.
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const [chileYear, chileMonth] = todayInChile().split("-").map(Number);
  const month = parseInt(searchParams.get("month") || String(chileMonth));
  const year = parseInt(searchParams.get("year") || String(chileYear));

  const scoped = (q: any) => (tenantId && tenantId !== "ALL" ? q.eq("tenant_id", tenantId) : q);

  // Encabezado con la identidad del negocio (logo primero).
  let businessName = "re-booking";
  let businessAddress = "";
  let businessLogo: string | null = null;
  if (tenantId && tenantId !== "ALL") {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("name, address, logo_url")
      .eq("id", tenantId)
      .single();
    if (tenantRow?.name) businessName = tenantRow.name;
    if (tenantRow?.address) businessAddress = tenantRow.address;
    businessLogo = tenantRow?.logo_url || null;
  }

  const range = (y: number, m: number) => {
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
    return { first, last, dim, startUtc: chileDayBoundsUtc(first).startUtc, endUtc: chileDayBoundsUtc(last).endUtc };
  };
  const cur = range(year, month);
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const prev = range(prevY, prevM);

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  // ---------- Datos del mes ----------
  // Ingresos y egresos se cuentan por su fecha contable ("Corresponde al mes"); ver src/lib/accounting.ts.
  const acc = await accountingColumnsAvailable(supabase);
  const rng = (r: { first: string; last: string; startUtc: string; endUtc: string }) =>
    ({ first: r.first, last: r.last, startIso: r.startUtc, endIso: r.endUtc });
  const income: any[] = await fetchMonthTx(supabase, {
    select: "id, total, subtotal, discount, payment_method, barber_id, client_id, coupon_id, created_at",
    type: "income", range: rng(cur), scope: scoped, acc,
  });
  const expenses: any[] = await fetchMonthTx(supabase, {
    select: "id, total", type: "expense", range: rng(cur), scope: scoped, acc,
  });

  // Mes anterior (solo totales, para las comparaciones).
  const prevIncomeTx = await fetchMonthTx(supabase, { select: "total", type: "income", range: rng(prev), scope: scoped, acc });
  const prevExpenseTx = await fetchMonthTx(supabase, { select: "total", type: "expense", range: rng(prev), scope: scoped, acc });
  const { count: prevNewClients } = await scoped(supabase
    .from("clients").select("id", { count: "exact", head: true })
    .gte("created_at", prev.startUtc).lt("created_at", prev.endUtc));

  const sum = (rows: any[]) => rows.reduce((s, t) => s + Number(t.total), 0);
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  const netProfit = totalIncome - totalExpenses;
  const margin = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;
  const prevIncome = sum(prevIncomeTx || []);
  const prevExpenses = sum(prevExpenseTx || []);
  const prevNet = prevIncome - prevExpenses;
  const salesCount = income.length;
  const avgTicket = salesCount > 0 ? totalIncome / salesCount : 0;
  const prevSales = (prevIncomeTx || []).length;
  const prevAvgTicket = prevSales > 0 ? prevIncome / prevSales : 0;

  // Citas del mes por estado y origen.
  const { data: apptRows } = await scoped(supabase
    .from("appointments")
    .select("status, source")
    .gte("date", cur.first).lte("date", cur.last));
  const appts: any[] = apptRows || [];
  const apptBy = (st: string) => appts.filter((a) => a.status === st).length;
  const apptCompleted = apptBy("completed");
  const apptCancelled = apptBy("cancelled");
  const apptNoShow = apptBy("no_show");
  const apptTotal = appts.length;
  const apptOnline = appts.filter((a) => a.source === "link").length;

  // Clientes: nuevos, atendidos, recurrentes.
  const { data: newClientRows } = await scoped(supabase
    .from("clients")
    .select("id, acquisition_source, acquisition_detail")
    .gte("created_at", cur.startUtc).lt("created_at", cur.endUtc));
  const newClientsList: any[] = newClientRows || [];
  const newClients = newClientsList.length;
  const { count: totalClientBase } = await scoped(supabase
    .from("clients").select("id", { count: "exact", head: true }));

  const attendedIds = Array.from(new Set(income.map((t) => t.client_id).filter(Boolean))) as string[];
  const attendedRows = await inChunks<any>(attendedIds, (c) =>
    supabase.from("clients").select("id, created_at").in("id", c));
  const startMs = new Date(cur.startUtc).getTime();
  const attendedNew = attendedRows.filter((c) => new Date(c.created_at).getTime() >= startMs).length;
  const attendedReturning = attendedRows.length - attendedNew;

  // Origen de los clientes nuevos.
  const sourceMap: Record<string, number> = {};
  const promoDetail: Record<string, number> = {};
  for (const c of newClientsList) {
    const key = c.acquisition_source && SOURCE_LABELS[c.acquisition_source] ? c.acquisition_source : "unknown";
    sourceMap[key] = (sourceMap[key] || 0) + 1;
    if (c.acquisition_source === "promotion" && c.acquisition_detail) {
      const d = String(c.acquisition_detail).trim();
      if (d) promoDetail[d] = (promoDetail[d] || 0) + 1;
    }
  }
  const sourceRows = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]);
  const promoClients = sourceMap["promotion"] || 0;

  // Promociones / cupones usados en ventas.
  const discounted = income.filter((t) => Number(t.discount) > 0 || t.coupon_id);
  const totalDiscount = discounted.reduce((s, t) => s + Number(t.discount || 0), 0);
  const couponIds = Array.from(new Set(discounted.map((t) => t.coupon_id).filter(Boolean))) as string[];
  const couponRows = await inChunks<any>(couponIds, (c) => supabase.from("coupons").select("id, code, description").in("id", c));
  const couponInfo = Object.fromEntries(couponRows.map((c) => [c.id, c]));
  const couponMap: Record<string, { uses: number; discount: number; revenue: number }> = {};
  for (const t of discounted) {
    if (!t.coupon_id) continue;
    const label = couponInfo[t.coupon_id]?.code || "Cupón";
    if (!couponMap[label]) couponMap[label] = { uses: 0, discount: 0, revenue: 0 };
    couponMap[label].uses++;
    couponMap[label].discount += Number(t.discount || 0);
    couponMap[label].revenue += Number(t.total);
  }
  const couponList = Object.entries(couponMap).sort((a, b) => b[1].uses - a[1].uses).slice(0, 5);

  // Servicios vs productos (items de las ventas del mes, por lotes).
  const txIds = income.map((t) => t.id);
  const items = await inChunks<any>(txIds, (c) =>
    supabase.from("transaction_items").select("description, total, quantity, service_id, product_id").in("transaction_id", c));
  let servicesRevenue = 0;
  let productsRevenue = 0;
  const svcMap: Record<string, { total: number; count: number }> = {};
  const prodMap: Record<string, { total: number; count: number }> = {};
  for (const it of items) {
    if (it.service_id) {
      servicesRevenue += Number(it.total);
      const k = it.description || "Servicio";
      if (!svcMap[k]) svcMap[k] = { total: 0, count: 0 };
      svcMap[k].total += Number(it.total); svcMap[k].count += Number(it.quantity);
    } else if (it.product_id) {
      productsRevenue += Number(it.total);
      const k = it.description || "Producto";
      if (!prodMap[k]) prodMap[k] = { total: 0, count: 0 };
      prodMap[k].total += Number(it.total); prodMap[k].count += Number(it.quantity);
    }
  }
  const topServices = Object.entries(svcMap).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const topProducts = Object.entries(prodMap).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const itemsRevenue = servicesRevenue + productsRevenue;

  // Metodos de pago.
  const methodMap: Record<string, { total: number; count: number }> = {};
  for (const t of income) {
    const m = t.payment_method;
    if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
    methodMap[m].total += Number(t.total); methodMap[m].count++;
  }
  const paymentLabels: Record<string, string> = {
    cash: "Efectivo", debit_card: "Débito", credit_card: "Crédito", transfer: "Transferencia", mixed: "Mixto",
  };
  const methodRows = Object.entries(methodMap).sort((a, b) => b[1].total - a[1].total);

  // Profesionales (agrupados por nombre normalizado, como en el resto del cierre).
  const barberIds = Array.from(new Set(income.map((t) => t.barber_id).filter(Boolean))) as string[];
  const profiles = await inChunks<any>(barberIds, (c) => supabase.from("profiles").select("id, name").in("id", c));
  const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.name]));
  const barberGroups: Record<string, { name: string; total: number; count: number }> = {};
  for (const t of income) {
    if (!t.barber_id) continue;
    const name = nameById[t.barber_id] || "Desconocido";
    const key = normalizeName(name);
    if (!barberGroups[key]) barberGroups[key] = { name, total: 0, count: 0 };
    barberGroups[key].total += Number(t.total); barberGroups[key].count++;
  }
  const barberRows = Object.values(barberGroups).sort((a, b) => b.total - a.total);

  // Dias: mejor dia del mes y distribucion por dia de la semana (hora de Chile).
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: CL_TZ });
  const wdFmt = new Intl.DateTimeFormat("es-CL", { timeZone: CL_TZ, weekday: "long" });
  const byDate: Record<string, number> = {};
  const byWeekday: Record<string, { total: number; count: number }> = {};
  for (const t of income) {
    const d = new Date(t.created_at);
    const dk = dayFmt.format(d);
    byDate[dk] = (byDate[dk] || 0) + Number(t.total);
    const wd = wdFmt.format(d);
    if (!byWeekday[wd]) byWeekday[wd] = { total: 0, count: 0 };
    byWeekday[wd].total += Number(t.total); byWeekday[wd].count++;
  }
  const bestDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
  const activeDays = Object.keys(byDate).length;
  const weekdayOrder = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const weekdayRows = weekdayOrder.map((w) => [w, byWeekday[w] || { total: 0, count: 0 }] as [string, { total: number; count: number }]);
  const maxWeekday = Math.max(1, ...weekdayRows.map(([, v]) => v.total));
  const bestWeekday = [...weekdayRows].sort((a, b) => b[1].total - a[1].total)[0];

  // Egresos manuales (detalle).
  const expenseItems = await inChunks<any>(expenses.map((t) => t.id), (c) =>
    supabase.from("transaction_items").select("description, total").in("transaction_id", c));
  const expenseMap: Record<string, number> = {};
  for (const it of expenseItems) {
    const label = it.description || "Otro egreso";
    expenseMap[label] = (expenseMap[label] || 0) + Number(it.total);
  }
  const expenseRows = Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);

  // ---------- Presentacion ----------
  const ACCENT = "#0F8B8D";
  const delta = (now: number, before: number, invert = false) => {
    if (before <= 0) return "";
    const d = Math.round(((now - before) / before) * 100);
    const good = invert ? d <= 0 : d >= 0;
    const color = good ? "#15803d" : "#b91c1c";
    const bg = good ? "#dcfce7" : "#fee2e2";
    return `<span class="chip" style="color:${color};background:${bg};">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}% vs ${monthNames[prevM - 1].toLowerCase()}</span>`;
  };

  const bar = (value: number, max: number, color = ACCENT) =>
    `<div class="bar"><span style="width:${max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0}%;background:${color};"></span></div>`;

  const kpi = (label: string, value: string, sub = "", hero = false) => `
    <div class="kpi${hero ? " hero" : ""}">
      <div class="k-label">${label}</div>
      <div class="k-value">${value}</div>
      ${sub ? `<div class="k-sub">${sub}</div>` : ""}
    </div>`;

  const table = (head: string[], rows: string[][], alignRight: number[] = []) => `
    <table>
      <thead><tr>${head.map((h, i) => `<th class="${alignRight.includes(i) ? "r" : ""}">${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${alignRight.includes(i) ? "r" : ""}">${c}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${head.length}" class="empty">Sin datos en este periodo</td></tr>`}</tbody>
    </table>`;

  // Resumen ejecutivo en lenguaje simple.
  const highlights: string[] = [];
  if (prevIncome > 0) {
    const d = Math.round(((totalIncome - prevIncome) / prevIncome) * 100);
    highlights.push(`Los ingresos ${d >= 0 ? "subieron" : "bajaron"} un <b>${Math.abs(d)}%</b> respecto de ${monthNames[prevM - 1].toLowerCase()}.`);
  }
  highlights.push(`La utilidad neta fue <b>${fmt(netProfit)}</b>, un margen de <b>${margin}%</b> sobre lo vendido.`);
  if (barberRows[0]) highlights.push(`Mejor profesional del mes: <b>${esc(barberRows[0].name)}</b> con ${fmt(barberRows[0].total)} (${pct(barberRows[0].total, totalIncome)}% de los ingresos).`);
  if (topServices[0]) highlights.push(`Servicio más vendido: <b>${esc(topServices[0][0])}</b> (${topServices[0][1].count} ventas).`);
  if (bestDay) highlights.push(`Mejor día: <b>${bestDay[0].split("-").reverse().join("-")}</b> con ${fmt(bestDay[1])}. El día de la semana más fuerte fue el <b>${bestWeekday[0]}</b>.`);
  highlights.push(`${newClients === 1 ? "Llegó" : "Llegaron"} <b>${newClients}</b> ${newClients === 1 ? "cliente nuevo" : "clientes nuevos"}${promoClients > 0 ? `, <b>${promoClients}</b> por promoción` : ""}; atendiste a <b>${attendedRows.length}</b> ${attendedRows.length === 1 ? "cliente distinto" : "clientes distintos"}, de los cuales <b>${attendedReturning}</b> ${attendedReturning === 1 ? "ya era cliente" : "ya eran clientes"}.`);
  if (apptTotal > 0) highlights.push(`De ${apptTotal} citas agendadas, ${apptCompleted} se completaron (${pct(apptCompleted, apptTotal)}%); hubo ${apptCancelled} cancelaciones y ${apptNoShow} no asistencias.`);

  const brandBlock = businessLogo
    ? `<img class="logo" src="${esc(businessLogo)}" alt="${esc(businessName)}" />`
    : `<div class="brand-text">${esc(businessName)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>Cierre Mensual - ${monthNames[month - 1]} ${year} - ${esc(businessName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --accent: ${ACCENT}; --ink: #111827; --muted: #6b7280; --line: #eceff1; --soft: #f7f9fa; color-scheme: light only; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: var(--ink); background: #fff; padding: 0 20px 48px; max-width: 860px; margin: 0 auto; font-size: 13px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; margin-bottom: 8px; background: rgba(255,255,255,.92); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font: 600 13px inherit; font-family: inherit; text-decoration: none; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--ink); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 28px 0 22px; border-bottom: 1px solid var(--line); }
    .logo { height: 60px; max-width: 240px; width: auto; object-fit: contain; display: block; }
    .brand-text { font-size: 26px; font-weight: 800; letter-spacing: -.4px; }
    .head-right { text-align: right; }
    .eyebrow { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
    .period { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin-top: 2px; }
    .meta { color: var(--muted); font-size: 11.5px; margin-top: 4px; }
    .accent-line { height: 3px; background: linear-gradient(90deg, var(--accent), #34d399); border-radius: 3px; margin-bottom: 24px; }
    h2 { font-size: 13px; font-weight: 700; letter-spacing: .02em; margin: 30px 0 12px; display: flex; align-items: center; gap: 8px; }
    h2::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .sub { color: var(--muted); font-size: 11.5px; margin: -6px 0 12px; }
    .grid { display: grid; gap: 12px; }
    .g3 { grid-template-columns: repeat(3, 1fr); } .g4 { grid-template-columns: repeat(4, 1fr); } .g2 { grid-template-columns: repeat(2, 1fr); }
    .kpi { border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; background: #fff; break-inside: avoid; }
    .kpi.hero { background: linear-gradient(135deg, #0F8B8D, #10b981); border-color: transparent; color: #fff; }
    .k-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .hero .k-label { color: rgba(255,255,255,.8); }
    .k-value { font-size: 24px; font-weight: 800; letter-spacing: -.5px; margin-top: 4px; }
    .k-sub { margin-top: 6px; font-size: 11px; color: var(--muted); }
    .hero .k-sub { color: rgba(255,255,255,.85); }
    .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
    .card { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; break-inside: avoid; }
    .summary { background: var(--soft); border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; }
    .summary li { margin: 6px 0 6px 18px; }
    .summary li::marker { color: var(--accent); }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 700; padding: 8px 6px; border-bottom: 1.5px solid var(--ink); }
    td { padding: 9px 6px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
    .r { text-align: right; } .empty { text-align: center; color: #9ca3af; padding: 16px; }
    tr { break-inside: avoid; }
    .bar { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; min-width: 70px; }
    .bar span { display: block; height: 100%; border-radius: 999px; }
    .row { display: flex; align-items: center; gap: 10px; margin: 9px 0; font-size: 12.5px; }
    .row .lbl { width: 130px; flex-shrink: 0; text-transform: capitalize; }
    .row .val { width: 120px; text-align: right; flex-shrink: 0; font-weight: 600; }
    .row .bar { flex: 1; }
    .note { color: var(--muted); font-size: 11px; margin-top: 10px; }
    .foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); text-align: center; color: #9ca3af; font-size: 11px; }
    .foot b { color: var(--accent); }
    @media (max-width: 640px) { .g3, .g4 { grid-template-columns: repeat(2, 1fr); } .g2 { grid-template-columns: 1fr; } .head { flex-direction: column; align-items: flex-start; } .head-right { text-align: left; } .row .lbl { width: 90px; } .row .val { width: 90px; } }
    @media print { body { padding: 0; } .no-print { display: none !important; } h2 { break-after: avoid; } }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <a class="btn" href="/dashboard/reportes" onclick="if (window.history.length > 1) { window.history.back(); return false; }">← Volver al reporte</a>
    <button class="btn primary" onclick="window.print()">Descargar PDF / Imprimir</button>
  </div>

  <div class="head">
    <div>${brandBlock}</div>
    <div class="head-right">
      <div class="eyebrow">Cierre mensual</div>
      <div class="period">${monthNames[month - 1]} ${year}</div>
      <div class="meta">${businessLogo ? `${esc(businessName)} · ` : ""}${businessAddress ? `${esc(businessAddress)} · ` : ""}Generado el ${new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: CL_TZ })}</div>
    </div>
  </div>
  <div class="accent-line"></div>

  <h2>Resultado del mes</h2>
  <div class="grid g3">
    ${kpi("Ingresos", fmt(totalIncome), delta(totalIncome, prevIncome), true)}
    ${kpi("Egresos", fmt(totalExpenses), delta(totalExpenses, prevExpenses, true))}
    ${kpi("Utilidad neta", fmt(netProfit), `Margen ${margin}% ${delta(netProfit, prevNet)}`)}
  </div>

  <h2>Resumen del mes</h2>
  <div class="summary"><ul>${highlights.map((h) => `<li>${h}</li>`).join("")}</ul></div>

  <h2>Actividad</h2>
  <div class="grid g4">
    ${kpi("Ventas", String(salesCount), delta(salesCount, prevSales))}
    ${kpi("Ticket promedio", fmt(avgTicket), delta(avgTicket, prevAvgTicket))}
    ${kpi("Citas completadas", String(apptCompleted), apptTotal > 0 ? `${pct(apptCompleted, apptTotal)}% de ${apptTotal} agendadas` : "")}
    ${kpi("Reservas por link", String(apptOnline), apptTotal > 0 ? `${pct(apptOnline, apptTotal)}% de las citas` : "")}
  </div>
  <p class="note">"Ventas" incluye todo lo cobrado en caja o punto de venta (con o sin cita previa). Cancelaciones: <b>${apptCancelled}</b> · No asistieron: <b>${apptNoShow}</b>${apptTotal > 0 ? ` · Tasa de pérdida: <b>${pct(apptCancelled + apptNoShow, apptTotal)}%</b>` : ""}.</p>

  <h2>Clientes</h2>
  <div class="grid g4">
    ${kpi("Clientes nuevos", String(newClients), delta(newClients, prevNewClients || 0))}
    ${kpi("Vinieron por promoción", String(promoClients), newClients > 0 ? `${pct(promoClients, newClients)}% de los nuevos` : "")}
    ${kpi("Clientes atendidos", String(attendedRows.length), `${attendedReturning} recurrentes · ${attendedNew} nuevos`)}
    ${kpi("Base de clientes", String(totalClientBase || 0), "Total registrados")}
  </div>
  <div class="grid g2" style="margin-top:12px;">
    <div class="card">
      <div class="k-label" style="margin-bottom:8px;">¿Cómo llegaron los clientes nuevos?</div>
      ${sourceRows.length ? sourceRows.map(([k, n]) => `<div class="row"><span class="lbl" style="text-transform:none;">${SOURCE_LABELS[k]}</span>${bar(n, sourceRows[0][1])}<span class="val" style="width:70px;">${n} · ${pct(n, newClients)}%</span></div>`).join("") : `<div class="empty">Sin clientes nuevos en el mes</div>`}
      ${Object.keys(promoDetail).length ? `<p class="note">Promociones indicadas: ${Object.entries(promoDetail).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => `${esc(d)} (${n})`).join(", ")}</p>` : ""}
    </div>
    <div class="card">
      <div class="k-label" style="margin-bottom:8px;">Descuentos y cupones</div>
      <div class="row"><span class="lbl" style="text-transform:none;">Ventas con descuento</span><span class="val" style="flex:1;">${discounted.length} · ${pct(discounted.length, salesCount)}% de las ventas</span></div>
      <div class="row"><span class="lbl" style="text-transform:none;">Descuento entregado</span><span class="val" style="flex:1;">${fmt(totalDiscount)}</span></div>
      ${couponList.length ? table(["Cupón", "Usos", "Descuento"], couponList.map(([code, v]) => [esc(code), String(v.uses), fmt(v.discount)]), [1, 2]) : `<p class="note">No se usaron cupones este mes.</p>`}
    </div>
  </div>

  <h2>Qué se vendió</h2>
  <div class="grid g2">
    <div class="card">
      <div class="k-label" style="margin-bottom:8px;">Servicios vs productos</div>
      <div class="row"><span class="lbl" style="text-transform:none;">Servicios</span>${bar(servicesRevenue, itemsRevenue)}<span class="val">${fmt(servicesRevenue)} · ${pct(servicesRevenue, itemsRevenue)}%</span></div>
      <div class="row"><span class="lbl" style="text-transform:none;">Productos</span>${bar(productsRevenue, itemsRevenue, "#f59e0b")}<span class="val">${fmt(productsRevenue)} · ${pct(productsRevenue, itemsRevenue)}%</span></div>
      <div class="k-label" style="margin:16px 0 6px;">Formas de pago</div>
      ${methodRows.map(([m, v]) => `<div class="row"><span class="lbl" style="text-transform:none;">${paymentLabels[m] || esc(m)}</span>${bar(v.total, methodRows[0][1].total, "#6366f1")}<span class="val">${fmt(v.total)} · ${pct(v.total, totalIncome)}%</span></div>`).join("") || `<div class="empty">Sin ventas</div>`}
    </div>
    <div class="card">
      <div class="k-label" style="margin-bottom:6px;">Servicios más vendidos</div>
      ${table(["Servicio", "Cant.", "Total"], topServices.map(([n, v]) => [esc(n), String(v.count), fmt(v.total)]), [1, 2])}
      <div class="k-label" style="margin:16px 0 6px;">Productos más vendidos</div>
      ${table(["Producto", "Cant.", "Total"], topProducts.map(([n, v]) => [esc(n), String(v.count), fmt(v.total)]), [1, 2])}
    </div>
  </div>

  <h2>Equipo</h2>
  <div class="card" style="padding:8px 18px;">
    ${table(["Profesional", "Ventas", "Ticket prom.", "Ingresos", "% del total"],
      barberRows.map((b) => [esc(b.name), String(b.count), fmt(b.count ? b.total / b.count : 0), `<b>${fmt(b.total)}</b>`, `${pct(b.total, totalIncome)}%`]), [1, 2, 3, 4])}
  </div>

  <h2>Cuándo se vende</h2>
  <div class="card">
    ${weekdayRows.map(([w, v]) => `<div class="row"><span class="lbl">${w}</span>${bar(v.total, maxWeekday, w === bestWeekday[0] ? ACCENT : "#9fd6d7")}<span class="val">${fmt(v.total)} · ${v.count} ventas</span></div>`).join("")}
    <p class="note">${activeDays} días con ventas de ${cur.dim}${bestDay ? ` · promedio por día activo ${fmt(totalIncome / Math.max(1, activeDays))}` : ""}.</p>
  </div>

  <h2>Egresos</h2>
  <div class="card" style="padding:8px 18px;">
    ${table(["Concepto", "Total", "% del egreso"], expenseRows.map(([n, t]) => [esc(n), fmt(t), `${pct(t, totalExpenses)}%`]), [1, 2])}
  </div>

  <div class="foot">
    <p>${esc(businessName)} · Cierre mensual ${monthNames[month - 1]} ${year}</p>
    <p>Documento generado automáticamente con <b>re-booking</b> · re-booking.cl</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
