// Cupos por bloque (solo Kinesiologia): cuantos clientes puede atender un profesional a la vez.
// Para cualquier otro rubro, o si la migracion 093 no esta aplicada, el cupo es 1 y todo se
// comporta exactamente como siempre.
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;
export interface Interval { start: number; end: number }

export const CAPACITY_CATEGORY = "kinesiologia";
export const MAX_CAPACITY = 6;

export async function getSlotCapacity(supabase: Admin, tenantId: string | null | undefined): Promise<number> {
  if (!tenantId) return 1;
  const { data, error } = await supabase
    .from("tenants")
    .select("business_category, max_clients_per_slot")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return 1; // columna aun no existe u otro problema: se comporta como antes
  if ((data as any).business_category !== CAPACITY_CATEGORY) return 1;
  const n = Math.floor(Number((data as any).max_clients_per_slot));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_CAPACITY) : 1;
}

// Mayor cantidad de citas existentes que coinciden en algun momento dentro de [start, end).
export function peakOverlap(intervals: Interval[], start: number, end: number): number {
  const events: Array<[number, number]> = [];
  for (const iv of intervals) {
    const s = Math.max(iv.start, start);
    const e = Math.min(iv.end, end);
    if (e > s) { events.push([s, 1]); events.push([e, -1]); }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // al empatar, primero cierran
  let cur = 0, peak = 0;
  for (const [, d] of events) { cur += d; if (cur > peak) peak = cur; }
  return peak;
}

// Tramos de tiempo donde ya hay `max` citas a la vez (el horario esta lleno).
export function fullSegments(intervals: Interval[], max: number): Interval[] {
  const events: Array<[number, number]> = [];
  for (const iv of intervals) if (iv.end > iv.start) { events.push([iv.start, 1]); events.push([iv.end, -1]); }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  let cur = 0, openAt: number | null = null;
  for (const [t, d] of events) {
    const before = cur;
    cur += d;
    if (before < max && cur >= max) openAt = t;
    else if (before >= max && cur < max && openAt !== null) { if (t > openAt) out.push({ start: openAt, end: t }); openAt = null; }
  }
  return out;
}

async function overlapping(supabase: Admin, barberId: string, date: string, startIso: string, endIso: string): Promise<{ id: string; iv: Interval }[]> {
  const { data } = await supabase
    .from("appointments")
    .select("id, start_time, end_time")
    .eq("barber_id", barberId)
    .eq("date", date)
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .lt("start_time", endIso)
    .gt("end_time", startIso);
  return (data || []).map((a: any) => ({ id: a.id, iv: { start: Date.parse(a.start_time), end: Date.parse(a.end_time) } }));
}

// Bloqueos parciales (migracion 102): ocupan `spots` cupos, como si fueran citas. Solo importa con cupo > 1;
// si la columna no existe devuelve vacio y todo funciona como antes.
async function partialBlocks(supabase: Admin, barberId: string, date: string, startMs: number, endMs: number): Promise<{ id: string; iv: Interval }[]> {
  const { data, error } = await supabase
    .from("barber_blocks")
    .select("id, start_time, end_time, spots")
    .eq("barber_id", barberId)
    .eq("date", date)
    .eq("all_day", false)
    .not("spots", "is", null);
  if (error) return [];
  const out: { id: string; iv: Interval }[] = [];
  for (const b of data || []) {
    if (!b.start_time || !b.end_time) continue;
    const iv = { start: Date.parse(`${date}T${String(b.start_time).slice(0, 5)}:00`), end: Date.parse(`${date}T${String(b.end_time).slice(0, 5)}:00`) };
    if (!(iv.end > startMs && iv.start < endMs)) continue;
    for (let i = 0; i < Number(b.spots); i++) out.push({ id: `block-${b.id}-${i}`, iv });
  }
  return out;
}

// true = NO se puede agendar (horario lleno para ese profesional).
export async function isSlotFull(supabase: Admin, barberId: string, tenantId: string | null | undefined, date: string, start: Date, end: Date, excludeId?: string): Promise<boolean> {
  const cap = await getSlotCapacity(supabase, tenantId);
  const rows = (await overlapping(supabase, barberId, date, start.toISOString(), end.toISOString())).filter((r) => r.id !== excludeId);
  if (cap > 1) rows.push(...(await partialBlocks(supabase, barberId, date, start.getTime(), end.getTime())));
  return rows.length > 0 && (cap === 1 ? true : peakOverlap(rows.map((r) => r.iv), start.getTime(), end.getTime()) >= cap);
}

// Segunda verificacion despues de guardar (dos personas pueden reservar el ultimo cupo a la vez).
// true = se paso del cupo (el que llama debe borrar la cita recien creada).
export async function exceededAfterInsert(supabase: Admin, barberId: string, tenantId: string | null | undefined, date: string, start: Date, end: Date): Promise<boolean> {
  const cap = await getSlotCapacity(supabase, tenantId);
  if (cap <= 1) return false;
  const rows = await overlapping(supabase, barberId, date, start.toISOString(), end.toISOString());
  rows.push(...(await partialBlocks(supabase, barberId, date, start.getTime(), end.getTime())));
  return peakOverlap(rows.map((r) => r.iv), start.getTime(), end.getTime()) > cap;
}
