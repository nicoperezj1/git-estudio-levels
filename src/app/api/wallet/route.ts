import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeBarberManagement } from "@/lib/supabase/server";
import { todayInChile, dateStrOffset, chileDayBoundsUtc } from "@/lib/utils";

const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Debito",
  credit_card: "Credito",
  transfer: "Transferencia",
  mixed: "Mixto",
};

// GET: Get wallet data for a professional
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");

  if (!barberId) return NextResponse.json({ error: "barberId required" }, { status: 400 });

  // SEGURIDAD: antes no pedia sesion y devolvia ganancias, comisiones y movimientos de cualquier profesional.
  // Ahora: el propio profesional, o admin/recepcion del mismo negocio (super_admin con cualquiera).
  const access = await authorizeBarberManagement(barberId, { allowSelf: true });
  if (!access.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // Get barber info
  const { data: barber } = await supabase
    .from("profiles")
    .select("id, name, work_mode, commission_rate, rental_daily_rate")
    .eq("id", barberId)
    .single();

  if (!barber) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  // Punto 1 (fix de arrastre, detectado al hacer el punto 16): esta ruta seguia usando
  // `new Date().toISOString().split("T")[0]` y limites naive "T00:00:00"/"T23:59:59"
  // (sin offset) para columnas timestamptz — el mismo patron ya corregido en el resto
  // del sistema, que aca se habia quedado sin tocar. Usa los helpers de Chile como
  // todo lo demas.
  const todayStr = todayInChile();
  const [chileYear, chileMonth] = todayStr.split("-").map(Number);
  const firstOfMonth = `${chileYear}-${String(chileMonth).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(chileYear, chileMonth, 0)).getUTCDate();
  const lastOfMonthStr = `${chileYear}-${String(chileMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthStartUtc = chileDayBoundsUtc(firstOfMonth).startUtc;
  const monthEndUtc = chileDayBoundsUtc(lastOfMonthStr).endUtc; // exclusive upper bound
  const todayBounds = chileDayBoundsUtc(todayStr);

  // Earnings this month (completed transactions)
  const { data: monthTx } = await supabase
    .from("transactions")
    .select("total, created_at")
    .eq("barber_id", barberId)
    .eq("type", "income")
    .eq("status", "completed")
    .gte("created_at", monthStartUtc)
    .lt("created_at", monthEndUtc);

  const totalSales = (monthTx || []).reduce((s, t) => s + Number(t.total), 0);

  // Calculate earnings based on mode
  let earned = 0;
  let mode = barber.work_mode || "commission";

  if (mode === "commission") {
    const rate = barber.commission_rate || 40;
    earned = Math.round(totalSales * (rate / 100));
  } else {
    // Rental: earnings = sales (they keep all), minus rental fee (deducted separately
    // at monthly close).
    earned = totalSales;
  }

  // Today's earnings
  const { data: todayTx } = await supabase
    .from("transactions")
    .select("total")
    .eq("barber_id", barberId)
    .eq("type", "income")
    .eq("status", "completed")
    .gte("created_at", todayBounds.startUtc)
    .lt("created_at", todayBounds.endUtc);

  const todayEarnings = (todayTx || []).reduce((s, t) => s + Number(t.total), 0);
  const todayCommission = mode === "commission" ? Math.round(todayEarnings * ((barber.commission_rate || 40) / 100)) : todayEarnings;

  // Projected: based on upcoming scheduled appointments
  const { data: upcomingAppts } = await supabase
    .from("appointments")
    .select("id, services:appointment_services(price)")
    .eq("barber_id", barberId)
    .in("status", ["scheduled", "confirmed"])
    .gte("date", todayStr)
    .lte("date", lastOfMonthStr);

  let projectedFromAppts = 0;
  for (const appt of upcomingAppts || []) {
    const apptTotal = ((appt as any).services || []).reduce((s: number, sv: any) => s + Number(sv.price || 0), 0);
    projectedFromAppts += apptTotal;
  }

  const projectedCommission = mode === "commission"
    ? Math.round(projectedFromAppts * ((barber.commission_rate || 40) / 100))
    : projectedFromAppts;

  const projected = earned + projectedCommission;

  // Daily breakdown (last 7 days)
  const dailyEarnings: Array<{ day: string; amount: number }> = [];
  const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  for (let i = 6; i >= 0; i--) {
    const dayStr = dateStrOffset(todayStr, -i);
    const dayBounds = chileDayBoundsUtc(dayStr);

    const { data: dayTx } = await supabase
      .from("transactions")
      .select("total")
      .eq("barber_id", barberId)
      .eq("type", "income")
      .eq("status", "completed")
      .gte("created_at", dayBounds.startUtc)
      .lt("created_at", dayBounds.endUtc);

    const dayTotal = (dayTx || []).reduce((s, t) => s + Number(t.total), 0);
    const dayCommission = mode === "commission" ? Math.round(dayTotal * ((barber.commission_rate || 40) / 100)) : dayTotal;

    // Weekday from the noon-UTC instant of that calendar date, so it never shifts off
    // by a day regardless of the server's own timezone.
    const weekday = new Date(`${dayStr}T12:00:00Z`).getUTCDay();
    dailyEarnings.push({ day: dayNames[weekday], amount: dayCommission });
  }

  // Transaction count
  const txCount = monthTx?.length || 0;

  // Punto 16 (Pablo): detalle diario de movimientos, con selector de fecha/rango en el
  // frontend. Por defecto (sin from/to) trae el dia de hoy en Chile.
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromStr = fromParam && dateRe.test(fromParam) ? fromParam : todayStr;
  const toStr = toParam && dateRe.test(toParam) ? toParam : fromStr;
  const rangeStartUtc = chileDayBoundsUtc(fromStr).startUtc;
  const rangeEndUtc = chileDayBoundsUtc(toStr).endUtc; // exclusive upper bound

  const { data: movementsRaw } = await supabase
    .from("transactions")
    .select("id, total, payment_method, created_at, client:clients(name), items:transaction_items(description)")
    .eq("barber_id", barberId)
    .eq("type", "income")
    .eq("status", "completed")
    .gte("created_at", rangeStartUtc)
    .lt("created_at", rangeEndUtc)
    .order("created_at", { ascending: false });

  // Amounts here are the full sale (client's total), not the professional's commission
  // cut — the daily/month cards above already show the commission-adjusted figures;
  // this detail list is "lo generado" per Pablo's wording (the underlying sales), same
  // as Finanzas shows for any other transaction.
  const movements = (movementsRaw || []).map((t: any) => ({
    id: t.id,
    createdAt: t.created_at,
    clientName: t.client?.name || "Cliente",
    service: (t.items || []).map((i: any) => i.description).filter(Boolean).join(", ") || "-",
    amount: Number(t.total),
    paymentMethod: t.payment_method,
    paymentMethodLabel: paymentMethodLabels[t.payment_method] || t.payment_method,
  }));

  return NextResponse.json({
    barber: { name: barber.name, mode, commissionRate: barber.commission_rate, rentalRate: barber.rental_daily_rate },
    month: {
      earned,
      totalSales,
      projected,
      projectedFromAppts: projectedCommission,
      txCount,
      upcomingAppts: upcomingAppts?.length || 0,
    },
    today: { earnings: todayCommission, sales: todayEarnings },
    dailyEarnings,
    movements,
    movementsRange: { from: fromStr, to: toStr },
  });
}
