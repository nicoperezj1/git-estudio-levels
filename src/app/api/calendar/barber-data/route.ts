import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Datos del calendario de varios profesionales en UNA llamada (antes eran 1 llamada por
// profesional y por mes para bloqueos, y otra por profesional para horarios; con 8
// profesionales eran ~20 llamadas, cada una con su propia verificacion de sesion).
//   GET ?barberIds=a,b,c&from=YYYY-MM-DD&to=YYYY-MM-DD&include=blocks,schedules
// Responde { blocks: [...], schedules: { [barberId]: [7 filas] } }.
// Valida la sesion una sola vez y que todos los profesionales sean del negocio del usuario.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const defaultSchedule = (barberId: string) =>
  Array.from({ length: 7 }, (_, i) => ({
    barber_id: barberId,
    day_of_week: i,
    is_working: i !== 0, // domingo libre por defecto
    start_time: "10:00",
    end_time: "20:00",
    break_start: null,
    break_end: null,
  }));

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ids = Array.from(
    new Set((searchParams.get("barberIds") || "").split(",").map((s) => s.trim()).filter(Boolean))
  );
  const include = (searchParams.get("include") || "blocks,schedules").split(",");
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const wantBlocks = include.includes("blocks");
  const wantSchedules = include.includes("schedules");

  if (ids.length === 0) return NextResponse.json({ blocks: [], schedules: {} });
  if (ids.length > 100) return NextResponse.json({ error: "Demasiados profesionales" }, { status: 400 });
  if (wantBlocks && (!DATE_RE.test(from) || !DATE_RE.test(to))) {
    return NextResponse.json({ error: "from y to (YYYY-MM-DD) requeridos" }, { status: 400 });
  }

  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminSupabase();

  // Cada profesional debe ser del negocio del usuario (super_admin ve todos).
  if (role !== "super_admin") {
    if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const { data: pros } = await supabase.from("profiles").select("id, tenant_id").in("id", ids);
    const allowed = (pros || []).filter((p: any) => p.tenant_id === tenantId).length;
    if (allowed !== ids.length) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const [blocksRes, vacRes, schedRes] = await Promise.all([
    wantBlocks
      ? supabase
          .from("barber_blocks")
          .select("id, barber_id, date, all_day, start_time, end_time, reason, spots")
          .in("barber_id", ids)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
    // Si la tabla de vacaciones aun no existe (migracion 095), nadie esta de vacaciones.
    wantBlocks
      ? supabase
          .from("professional_vacations")
          .select("barber_id, start_date, end_date")
          .in("barber_id", ids)
          .lte("start_date", to)
          .gte("end_date", from)
      : Promise.resolve({ data: [] as any[], error: null }),
    wantSchedules
      ? supabase
          .from("barber_schedule")
          .select("barber_id, day_of_week, is_working, start_time, end_time, break_start, break_end")
          .in("barber_id", ids)
          .order("day_of_week")
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // Sin la migracion 102 (columna spots) se repite la consulta sin ella.
  let blocksData: any[] = (blocksRes.data || []) as any[];
  let blocksError = blocksRes.error;
  if (blocksError && wantBlocks && /spots/.test(blocksError.message)) {
    const retry = await supabase
      .from("barber_blocks")
      .select("id, barber_id, date, all_day, start_time, end_time, reason")
      .in("barber_id", ids).gte("date", from).lte("date", to).order("date", { ascending: true });
    blocksData = (retry.data || []) as any[]; blocksError = retry.error;
  }
  if (blocksError) console.error("[calendar/barber-data] blocks failed:", blocksError.message);

  const blocks: any[] = blocksError ? [] : [...blocksData];

  // Las vacaciones se muestran como bloqueos de todo el dia, solo de lectura
  // (igual que en /api/barber/blocks).
  if (!vacRes.error) {
    for (const v of (vacRes.data || []) as any[]) {
      const s = v.start_date < from ? from : v.start_date;
      const e = v.end_date > to ? to : v.end_date;
      for (let d = new Date(`${s}T12:00:00Z`); d <= new Date(`${e}T12:00:00Z`); d = new Date(d.getTime() + 86400000)) {
        const day = d.toISOString().slice(0, 10);
        blocks.push({
          id: `vac-${v.barber_id}-${day}`, barber_id: v.barber_id, date: day, all_day: true,
          start_time: null, end_time: null, reason: "Vacaciones", is_vacation: true,
        });
      }
    }
  }

  const schedules: Record<string, any[]> = {};
  if (wantSchedules) {
    for (const id of ids) schedules[id] = [];
    for (const r of (schedRes.data || []) as any[]) schedules[r.barber_id]?.push(r);
    // Sin horario guardado: valores por defecto (igual que /api/barber-schedule).
    for (const id of ids) if (schedules[id].length === 0) schedules[id] = defaultSchedule(id);
  }

  return NextResponse.json({ blocks, schedules });
}
