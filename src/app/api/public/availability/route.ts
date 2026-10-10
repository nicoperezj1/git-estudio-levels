import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSlotCapacity, fullSegments, peakOverlap } from "@/lib/capacity";
import { isOnVacation } from "@/lib/vacations";
import { getWindowDays, isBeyondWindow } from "@/lib/booking-window";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");
  const date = searchParams.get("date");
  const duration = parseInt(searchParams.get("duration") || "45");

  if (!barberId || !date) {
    return NextResponse.json({ error: "barberId and date required" }, { status: 400 });
  }

  // Vacaciones del profesional (migracion 095): ese dia no hay horas.
  if (await isOnVacation(supabase, barberId, date)) {
    return NextResponse.json({ slots: [], date, barberId, closed: true, vacation: true });
  }

  // Get day of week (0=Sunday, 1=Monday, etc.), computed independent of the server's
  // timezone. Using `new Date(date + "T12:00:00").getDay()` interpreted the date in the
  // SERVER's timezone (UTC on Vercel), so a Saturday chosen by a Chile user (UTC-3/-4)
  // could resolve to Friday/Sunday — the "día corrido" bug where the enabled day showed
  // as blocked and the neighbouring day opened by mistake. Parse the parts and use UTC.
  const [dyY, dyM, dyD] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(dyY, dyM - 1, dyD)).getUTCDay();

  // Try barber's personal schedule first
  const { data: barberSchedule } = await supabase
    .from("barber_schedule")
    .select("is_working, start_time, end_time, break_start, break_end")
    .eq("barber_id", barberId)
    .eq("day_of_week", dayOfWeek)
    .single();

  let openTime: string;
  let closeTime: string;
  let breakStart: string | null = null;
  let breakEnd: string | null = null;

  if (barberSchedule) {
    // Use per-barber schedule
    if (!barberSchedule.is_working) {
      return NextResponse.json({ slots: [], date, barberId, closed: true });
    }
    openTime = barberSchedule.start_time || "10:00";
    closeTime = barberSchedule.end_time || "20:00";
    breakStart = barberSchedule.break_start || null;
    breakEnd = barberSchedule.break_end || null;
  } else {
    // Fallback to tenant's business hours
    // Get barber's tenant
    const { data: barberTenant } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", barberId)
      .single();

    let hoursQuery = supabase
      .from("business_hours")
      .select("open_time, close_time, is_closed")
      .eq("day_of_week", dayOfWeek);

    if (barberTenant?.tenant_id) {
      hoursQuery = hoursQuery.eq("tenant_id", barberTenant.tenant_id);
    }

    const { data: hoursData } = await hoursQuery.single();

    if (hoursData?.is_closed) {
      return NextResponse.json({ slots: [], date, barberId, closed: true });
    }
    openTime = hoursData?.open_time || "10:00";
    closeTime = hoursData?.close_time || "21:00";
  }

  // Parse times to minutes (pure arithmetic, no Date objects — avoids timezone issues)
  const openHour = parseInt(openTime.split(":")[0]);
  const openMin = parseInt(openTime.split(":")[1]);
  const closeHour = parseInt(closeTime.split(":")[0]);
  const closeMin = parseInt(closeTime.split(":")[1]);
  const breakStartMin = breakStart ? parseInt(breakStart.split(":")[0]) * 60 + parseInt(breakStart.split(":")[1]) : null;
  const breakEndMin = breakEnd ? parseInt(breakEnd.split(":")[0]) * 60 + parseInt(breakEnd.split(":")[1]) : null;

  // Get barber's custom slot duration
  const { data: barberProfile } = await supabase
    .from("profiles")
    .select("slot_duration, tenant_id")
    .eq("id", barberId)
    .single();

  const slotInterval = barberProfile?.slot_duration || 15; // Default 15min intervals

  // Mas alla de los dias que el negocio deja agendar (Preferencias de reserva) no hay horas.
  const windowDays = await getWindowDays(supabase, (barberProfile as any)?.tenant_id);
  if (isBeyondWindow(date, windowDays)) return NextResponse.json({ slots: [], date, barberId, outOfWindow: true });

  // Cupos por bloque (solo kinesiologia; en el resto de los rubros siempre es 1 = como siempre).
  const capacity = await getSlotCapacity(supabase, (barberProfile as any)?.tenant_id);

  // Get existing appointments for this barber on this date
  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_time, end_time")
    .eq("barber_id", barberId)
    .eq("date", date)
    .in("status", ["scheduled", "confirmed", "in_progress"]);

  // Check if barber has blocked this day
  let { data: blocks, error: blocksErr } = (await supabase
    .from("barber_blocks")
    .select("all_day, start_time, end_time, spots")
    .eq("barber_id", barberId)
    .eq("date", date)) as { data: any[] | null; error: any };
  // Sin la migracion 102 (columna spots) se consulta como antes: todos los bloqueos ocupan todo el horario.
  if (blocksErr) {
    ({ data: blocks } = await supabase
      .from("barber_blocks")
      .select("all_day, start_time, end_time")
      .eq("barber_id", barberId)
      .eq("date", date));
  }

  // If any block is all_day, no slots available
  if (blocks?.some((b) => b.all_day)) {
    return NextResponse.json({ slots: [], date, barberId, blocked: true });
  }

  // Generate all possible slots
  const slots: string[] = [];

  const startMinutes = openHour * 60 + openMin;
  const endMinutes = closeHour * 60 + closeMin;

  // Get current time in Chile for "past slots" filter
  const nowChile = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const todayStr = `${nowChile.getFullYear()}-${String(nowChile.getMonth() + 1).padStart(2, "0")}-${String(nowChile.getDate()).padStart(2, "0")}`;
  const nowMinutes = nowChile.getHours() * 60 + nowChile.getMinutes();
  const isToday = date === todayStr;

  // Pre-parse busy intervals (appointments + partial blocks + break) into [start,end] min.
  const busyIntervals: Array<{ start: number; end: number }> = [];
  const apptIntervals: Array<{ start: number; end: number }> = [];
  for (const appt of appointments || []) {
    const s = appt.start_time.match(/(\d{2}):(\d{2})/);
    const e = appt.end_time.match(/(\d{2}):(\d{2})/);
    if (s && e) apptIntervals.push({ start: parseInt(s[1]) * 60 + parseInt(s[2]), end: parseInt(e[1]) * 60 + parseInt(e[2]) });
  }
  // Con cupo 1 cada cita bloquea su horario (igual que siempre). Con cupo > 1 solo se bloquean
  // los tramos donde ya hay tantas citas a la vez como cupos.
  // Un bloqueo con `spots` (migracion 102) ocupa solo esa cantidad de cupos, como si fueran citas.
  const capIntervals = [...apptIntervals];
  for (const block of blocks || []) {
    if (block.all_day || !block.start_time || !block.end_time) continue;
    const s = block.start_time.match(/(\d{2}):(\d{2})/);
    const e = block.end_time.match(/(\d{2}):(\d{2})/);
    if (!(s && e)) continue;
    const iv = { start: parseInt(s[1]) * 60 + parseInt(s[2]), end: parseInt(e[1]) * 60 + parseInt(e[2]) };
    const bs = Number((block as any).spots);
    if (capacity > 1 && bs >= 1 && bs < capacity) { for (let i = 0; i < bs; i++) capIntervals.push(iv); }
    else busyIntervals.push(iv);
  }
  if (capacity > 1) busyIntervals.push(...fullSegments(capIntervals, capacity));
  else busyIntervals.push(...apptIntervals);
  if (breakStartMin !== null && breakEndMin !== null) {
    busyIntervals.push({ start: breakStartMin, end: breakEndMin });
  }

  // Walk the day. When a candidate slot overlaps a busy interval (block/appt/break),
  // RE-ANCHOR the grid to the END of that interval instead of jumping to the next fixed
  // multiple of slotInterval. Before this, a 30-min block at 14:00 with a 3h grid killed
  // the whole 14:30–17:00 window (next fixed point was 17:00) — the "castiga 2:30" bug.
  // Now the next slot resumes right at the block's end (e.g. 14:30), so a 30-min block
  // only costs 30 min. For short services with a 15-min grid, behaviour is unchanged
  // (nothing is discarded when there are no conflicts, and re-anchoring to a block end
  // simply keeps the natural cadence).
  const isFree = (start: number) =>
    start >= startMinutes &&
    start + duration <= endMinutes &&
    !busyIntervals.some((iv) => start < iv.end && start + duration > iv.start);
  const isPast = (start: number) => isToday && start <= nowMinutes;

  const candidates = new Set<number>();
  let totalMin = startMinutes;
  let guard = 0;
  while (totalMin < endMinutes && guard++ < 500) {
    const slotStartMin = totalMin;
    const slotEndMin = totalMin + duration;

    // Past close time — nothing more fits.
    if (slotEndMin > endMinutes) break;

    // Does this slot overlap any busy interval? If so, find the LATEST end among the
    // overlapping ones and re-anchor there.
    let reanchorTo: number | null = null;
    for (const iv of busyIntervals) {
      if (slotStartMin < iv.end && slotEndMin > iv.start) {
        reanchorTo = reanchorTo === null ? iv.end : Math.max(reanchorTo, iv.end);
      }
    }

    if (reanchorTo !== null) {
      totalMin = reanchorTo; // resume exactly when the barber is free again
      continue;
    }

    // Past slots (today) are dropped only AFTER re-anchoring. Skipping them first kept
    // today's grid tied to the opening time: with a 10–12 block, 14–15 break and 45-min
    // grid, at 14:46 the first candidate was 15:15 (10:00 + n·45) and the free 15:00
    // (right after the break) never showed — Bastián's "tengo un espacio a las 3" report.
    if (!isPast(slotStartMin)) candidates.add(slotStartMin);
    totalMin += slotInterval;
  }

  // Also offer the slot that ENDS exactly when the next appointment/block/break starts.
  // The grid only packs forward from each busy end, so a gap before the next booking
  // (e.g. 16:45–17:15 between a 60-min and a 17:15 appointment) was left unbookable
  // and never filled. This lets a client take the time that closes the gap.
  for (const iv of busyIntervals) {
    const start = iv.start - duration;
    if (isFree(start) && !isPast(start)) candidates.add(start);
  }

  for (const m of Array.from(candidates).sort((a, b) => a - b)) {
    slots.push(`${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
  }

  if (capacity > 1) {
    const spots: Record<string, number> = {};
    for (const slot of slots) {
      const m = parseInt(slot.slice(11, 13)) * 60 + parseInt(slot.slice(14, 16));
      spots[slot] = Math.max(0, capacity - peakOverlap(capIntervals, m, m + duration));
    }
    return NextResponse.json({ slots, date, barberId, capacity, spots });
  }

  return NextResponse.json({ slots, date, barberId });
}
