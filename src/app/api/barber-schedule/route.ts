import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, canAccessBarber } from "@/lib/supabase/server";
import { loadBreaks, breaksForDay } from "@/lib/breaks";

// GET: Get schedule for a barber
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");

  if (!barberId) return NextResponse.json([]);
  if (!(await canAccessBarber(barberId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data } = await supabase
    .from("barber_schedule")
    .select("*")
    .eq("barber_id", barberId)
    .order("day_of_week");

  // If no schedule exists, return defaults (all days working 10-20)
  if (!data || data.length === 0) {
    const defaults = Array.from({ length: 7 }, (_, i) => ({
      barber_id: barberId,
      day_of_week: i,
      is_working: i !== 0, // Sunday off by default
      start_time: "10:00",
      end_time: "20:00",
      break_start: null,
      break_end: null,
    }));
    return NextResponse.json(defaults.map((d) => ({ ...d, breaks: [] })));
  }

  const table = await loadBreaks(supabase, [barberId]);
  return NextResponse.json(data.map((d: any) => ({ ...d, breaks: breaksForDay(table, barberId, d) })));
}

// POST: Save schedule for a barber (upsert all 7 days)
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { barberId, schedule } = await req.json();

  if (!barberId || !schedule) {
    return NextResponse.json({ error: "barberId and schedule required" }, { status: 400 });
  }
  if (!(await canAccessBarber(barberId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Breaks de cada dia (varios, con nombre y cupos). Se normalizan; si no llega `breaks` se usa el break unico.
  const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const cleanBreaks = (day: any) => {
    const raw = Array.isArray(day.breaks) ? day.breaks : day.break_start && day.break_end ? [{ start: day.break_start, end: day.break_end }] : [];
    return raw
      .map((b: any) => ({
        start: String(b.start || "").slice(0, 5),
        end: String(b.end || "").slice(0, 5),
        name: String(b.name || "").trim().slice(0, 40) || null,
        spots: Number.isFinite(Number(b.spots)) && Number(b.spots) >= 1 ? Math.min(6, Math.floor(Number(b.spots))) : null,
      }))
      .filter((b: any) => { const s = toMin(b.start), e = toMin(b.end); return s !== null && e !== null && e > s; })
      .sort((a: any, b: any) => (toMin(a.start) as number) - (toMin(b.start) as number));
  };

  const allBreaks: Array<{ barber_id: string; day_of_week: number; start_time: string; end_time: string; name: string | null; spots: number | null }> = [];
  // Upsert each day
  for (const day of schedule) {
    const bks = day.is_working ? cleanBreaks(day) : [];
    const first = bks[0];
    await supabase
      .from("barber_schedule")
      .upsert({
        barber_id: barberId,
        day_of_week: day.day_of_week,
        is_working: day.is_working,
        start_time: day.start_time || "10:00",
        end_time: day.end_time || "20:00",
        break_start: first?.start || null,
        break_end: first?.end || null,
      }, { onConflict: "barber_id,day_of_week" });
    for (const b of bks) allBreaks.push({ barber_id: barberId, day_of_week: day.day_of_week, start_time: b.start, end_time: b.end, name: b.name, spots: b.spots });
  }

  // Tabla de breaks (migracion 106). Sin ella solo queda el primer break del dia (en barber_schedule).
  const { error: delErr } = await supabase.from("barber_breaks").delete().eq("barber_id", barberId);
  if (delErr) {
    const extra = allBreaks.length > new Set(allBreaks.map((b) => b.day_of_week)).size;
    return NextResponse.json({ success: true, warning: extra ? "Falta aplicar la migración 106: solo se guardó el primer break de cada día." : undefined });
  }
  if (allBreaks.length > 0) {
    const { error: insErr } = await supabase.from("barber_breaks").insert(allBreaks);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
