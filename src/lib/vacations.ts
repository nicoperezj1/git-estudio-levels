// Vacaciones de profesionales (migracion 095). Si la tabla aun no existe, nadie esta de vacaciones
// (todo se comporta como siempre).
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;

// Fechas (YYYY-MM-DD) en que el profesional esta de vacaciones dentro de [from, to].
export async function vacationDates(supabase: Admin, barberId: string, from: string, to: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("professional_vacations")
    .select("start_date, end_date")
    .eq("barber_id", barberId)
    .lte("start_date", to)
    .gte("end_date", from);
  if (error || !data) return [];
  const out = new Set<string>();
  for (const v of data as any[]) {
    const s = v.start_date < from ? from : v.start_date;
    const e = v.end_date > to ? to : v.end_date;
    for (let d = new Date(`${s}T12:00:00Z`); d <= new Date(`${e}T12:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      out.add(d.toISOString().slice(0, 10));
    }
  }
  return Array.from(out).sort();
}

export async function isOnVacation(supabase: Admin, barberId: string, date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("professional_vacations")
    .select("id")
    .eq("barber_id", barberId)
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1);
  return !error && !!data && data.length > 0;
}

// Profesionales de un negocio que estan de vacaciones ese dia.
export async function barbersOnVacation(supabase: Admin, tenantId: string, date: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("professional_vacations")
    .select("barber_id")
    .eq("tenant_id", tenantId)
    .lte("start_date", date)
    .gte("end_date", date);
  return new Set(error || !data ? [] : (data as any[]).map((r) => r.barber_id));
}
