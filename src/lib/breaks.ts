// Breaks de un profesional (colacion, descanso...). Varios por dia, con nombre y, en negocios con cupos por
// bloque, cuantos cupos cierran (spots; null = todos). Tabla barber_breaks (migracion 106). Si la tabla aun no
// existe, o el dia no tiene filas, se usa el break unico de siempre (barber_schedule.break_start/break_end).
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;
export interface BreakItem { id?: string; start: string; end: string; name: string | null; spots: number | null }

const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");

export function legacyBreak(day: { break_start?: string | null; break_end?: string | null }): BreakItem[] {
  return day.break_start && day.break_end ? [{ start: hhmm(day.break_start), end: hhmm(day.break_end), name: null, spots: null }] : [];
}

/** { barberId: { dia: [breaks] } }, o null si la tabla aun no existe. */
export async function loadBreaks(supabase: Admin, barberIds: string[]): Promise<Record<string, Record<number, BreakItem[]>> | null> {
  if (barberIds.length === 0) return {};
  const { data, error } = await supabase
    .from("barber_breaks")
    .select("id, barber_id, day_of_week, start_time, end_time, name, spots")
    .in("barber_id", barberIds)
    .order("start_time");
  if (error) return null;
  const out: Record<string, Record<number, BreakItem[]>> = {};
  for (const r of (data || []) as any[]) {
    ((out[r.barber_id] ||= {})[r.day_of_week] ||= []).push({
      id: r.id, start: hhmm(r.start_time), end: hhmm(r.end_time), name: r.name || null, spots: r.spots ?? null,
    });
  }
  return out;
}

/** Breaks de un dia: los de la tabla si hay; si no, el break unico de siempre. */
export function breaksForDay(
  table: Record<string, Record<number, BreakItem[]>> | null,
  barberId: string,
  day: { day_of_week: number; break_start?: string | null; break_end?: string | null }
): BreakItem[] {
  const rows = table?.[barberId]?.[day.day_of_week];
  return rows && rows.length > 0 ? rows : legacyBreak(day);
}
