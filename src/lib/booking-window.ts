// Dias hacia adelante que el cliente puede agendar (Configuracion > Preferencias de reserva; migracion 099).
// null = como hasta ahora. Una ventana de N dias incluye hoy: el ultimo dia reservable es hoy + (N - 1).
import type { createAdminSupabase } from "@/lib/supabase/server";
import { dateStrOffset, todayInChile } from "@/lib/utils";

type Admin = ReturnType<typeof createAdminSupabase>;
export const WINDOW_OPTIONS = [7, 14, 21, 31];

export async function getWindowDays(supabase: Admin, tenantId: string | null | undefined): Promise<number | null> {
  if (!tenantId) return null;
  const { data, error } = await supabase.from("tenants").select("booking_window_days").eq("id", tenantId).maybeSingle();
  if (error) return null; // columna aun no existe
  const n = Number((data as any)?.booking_window_days);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

// true = la fecha cae mas alla de lo que el negocio deja agendar.
export function isBeyondWindow(date: string, windowDays: number | null): boolean {
  if (!windowDays) return false;
  return date > dateStrOffset(todayInChile(), windowDays - 1);
}
