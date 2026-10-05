import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { barbersOnVacation } from "@/lib/vacations";
import { getRuleConfig, rankCandidates, weeklyAutoCounts, type Candidate } from "@/lib/booking-rules";

// GET: Returns the barber with fewest appointments today (first available)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayInChile();
  const branchSlug = searchParams.get("branch") || searchParams.get("tenant");

  // Scope to the business. Without this, "primer barbero disponible" picked the barber
  // with fewest appointments ACROSS ALL businesses — that's why it returned Dylan from
  // another salon. Resolve the tenant by slug (hyphen-insensitive, like the rest).
  let tenantId: string | null = null;
  if (branchSlug) {
    const norm = (s: string) => s.replace(/-/g, "").toLowerCase();
    const { data: allTenants } = await supabase.from("tenants").select("id, slug").eq("active", true);
    const t = (allTenants || []).find((x) => norm(x.slug) === norm(branchSlug));
    tenantId = t?.id || null;
  }

  // Never pick a barber across ALL businesses. If we couldn't resolve the tenant (no
  // ?tenant=/?branch=, or an unknown slug), refuse instead of returning someone from
  // another salon — that cross-business leak is exactly the "aparece Pablo Yáñez en la
  // agenda de Saray" bug. Same fail-safe guard /api/public/barbers already has.
  if (!tenantId) {
    return NextResponse.json({ error: "Negocio no especificado" }, { status: 400 });
  }

  // Get active barbers, scoped to the business.
  const barberQuery = supabase
    .from("profiles")
    .select("id, name, avatar_url")
    .or("role.eq.barber,and(role.in.(admin,super_admin),also_attends_clients.eq.true)")
    .eq("active", true)
    .eq("tenant_id", tenantId);
  const { data: barbers } = await barberQuery;

  if (!barbers || barbers.length === 0) {
    return NextResponse.json({ error: "No hay profesionales activos" }, { status: 404 });
  }

  // Get appointment counts per barber for this date
  const { data: appointments } = await supabase
    .from("appointments")
    .select("barber_id")
    .eq("date", date)
    .in("status", ["scheduled", "confirmed", "in_progress"]);

  // Count per barber
  const countMap: Record<string, number> = {};
  for (const b of barbers) countMap[b.id] = 0;
  for (const a of appointments || []) {
    if (countMap[a.barber_id] !== undefined) countMap[a.barber_id]++;
  }

  // Check for all-day blocked barbers
  const { data: blocks } = await supabase
    .from("barber_blocks")
    .select("barber_id")
    .eq("date", date)
    .eq("all_day", true);

  const blockedIds = new Set((blocks || []).map((b) => b.barber_id));
  // De vacaciones ese dia (migracion 095).
  for (const id of Array.from(await barbersOnVacation(supabase, tenantId, date))) blockedIds.add(id);

  // Exclude barbers who DON'T WORK on this weekday. "Primer barbero disponible" was
  // returning professionals on their day off because it only checked all-day blocks,
  // not the weekly schedule. A barber is off if barber_schedule for this weekday has
  // is_working = false. If a barber has NO schedule row at all, we DON'T exclude them
  // (assume available) so a missing config doesn't leave the client with nobody.
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const { data: schedules } = await supabase
    .from("barber_schedule")
    .select("barber_id, is_working")
    .eq("day_of_week", weekday)
    .in("barber_id", barbers.map((b) => b.id));

  const offToday = new Set(
    (schedules || []).filter((s) => s.is_working === false).map((s) => s.barber_id)
  );

  // Find barber with least appointments, excluding all-day-blocked and day-off barbers.
  const available = barbers
    .filter((b) => !blockedIds.has(b.id) && !offToday.has(b.id))
    .map((b) => ({ ...b, appointments: countMap[b.id] || 0 }))
    .sort((a, b) => a.appointments - b.appointments);

  if (available.length === 0) {
    return NextResponse.json({ error: "No hay profesionales disponibles ese dia" }, { status: 404 });
  }

  // Regla elegida por el negocio (Fase 6). Sin configurar (o regla 1 sin hora puntual) todo queda
  // exactamente como antes: el de menos citas del dia.
  const cfg = await getRuleConfig(supabase, tenantId);
  const slot = searchParams.get("slot"); // hora ya elegida por el cliente ("YYYY-MM-DDTHH:MM:SS")
  const candParam = (searchParams.get("candidates") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const duration = Math.max(15, parseInt(searchParams.get("duration") || "45") || 45);

  let pool = available;
  if (candParam.length > 0) {
    const narrowed = available.filter((b) => candParam.includes(b.id));
    if (narrowed.length > 0) pool = narrowed;
  }

  let ranked = pool;
  if (cfg.rule !== "least_agenda" || candParam.length > 0) {
    let cands: Candidate[] = pool.map((b) => ({ id: b.id, appointments: b.appointments, firstSlot: slot || null }));
    // Sin hora elegida, las reglas 2 y 3 miran las horas libres de cada profesional ese dia.
    if (!slot && cfg.rule !== "least_agenda") {
      const origin = new URL(req.url).origin;
      const withSlots = await Promise.all(cands.map(async (c) => {
        try {
          const r = await fetch(`${origin}/api/public/availability?barberId=${c.id}&date=${date}&duration=${duration}`, { cache: "no-store" });
          const d = await r.json();
          return { ...c, firstSlot: (d.slots && d.slots[0]) || null };
        } catch { return c; }
      }));
      const free = withSlots.filter((c) => c.firstSlot);
      cands = free.length > 0 ? free : withSlots; // nunca quedarse sin candidatos
    }
    const autoCounts = cfg.rule === "target_share" ? await weeklyAutoCounts(supabase, tenantId, date) : {};
    const order = rankCandidates(cands, cfg, { allProIds: barbers.map((b) => b.id), autoCounts });
    const byId = new Map(pool.map((b) => [b.id, b]));
    ranked = order.map((c) => byId.get(c.id)!).filter(Boolean);
  }

  return NextResponse.json({
    barber: ranked[0],
    allAvailable: ranked,
    rule: cfg.rule,
  });
}
