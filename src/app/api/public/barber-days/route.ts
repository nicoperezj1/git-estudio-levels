import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { vacationDates } from "@/lib/vacations";
import { todayInChile, dateStrOffset } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET: days of the week (0=Sunday) a barber does NOT attend, for the public date picker.
// Mirrors /api/public/availability exactly: the barber's own schedule wins for a day;
// if the barber has no row for that day, fall back to their business's hours.
// Before this, the booking page used /api/business-hours with no tenant (anonymous
// client), which mixed every business's hours / defaulted Sunday to closed — so a
// professional who only works Sundays (David, Estudio Levels) never showed Sunday.
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const barberId = new URL(req.url).searchParams.get("barberId");
  if (!barberId) return NextResponse.json({ closedDays: [] });

  const [{ data: schedule }, { data: profile }] = await Promise.all([
    supabase.from("barber_schedule").select("day_of_week, is_working").eq("barber_id", barberId),
    supabase.from("profiles").select("tenant_id").eq("id", barberId).single(),
  ]);

  let hours: { day_of_week: number; is_closed: boolean }[] = [];
  if (profile?.tenant_id) {
    const { data } = await supabase
      .from("business_hours")
      .select("day_of_week, is_closed")
      .eq("tenant_id", profile.tenant_id);
    hours = data || [];
  }

  const closedDays: number[] = [];
  for (let day = 0; day < 7; day++) {
    const own = (schedule || []).find((s) => s.day_of_week === day);
    if (own) {
      if (!own.is_working) closedDays.push(day);
      continue;
    }
    if (hours.find((h) => h.day_of_week === day)?.is_closed) closedDays.push(day);
  }

  // Fechas puntuales en que el profesional esta de vacaciones (proximos 120 dias), para el selector de fecha.
  const today = todayInChile();
  const closedDates = await vacationDates(supabase, barberId, today, dateStrOffset(today, 120));

  return NextResponse.json({ closedDays, closedDates });
}
