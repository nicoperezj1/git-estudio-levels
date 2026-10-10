// Origenes de cliente ("¿Como nos conocio?"). Los de siempre viven aqui; cada negocio puede crear los
// suyos (tabla client_sources, migracion 104). El codigo de uno propio es "c_<nombre>".
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;
export interface SourceOption { code: string; label: string }

// Los que se ofrecen en los formularios (en este orden).
export const BUILTIN_SOURCES: SourceOption[] = [
  { code: "walk_in", label: "Pasó por fuera" },
  { code: "instagram", label: "Instagram" },
  { code: "tiktok", label: "TikTok" },
  { code: "facebook", label: "Facebook" },
  { code: "referral", label: "Referido de un amigo/conocido" },
  { code: "google_maps", label: "Google Maps" },
  { code: "promotion", label: "Promoción" },
  { code: "influencer", label: "Influencer" },
];
// Todas las etiquetas conocidas, incluidas las que no se ofrecen (se crean solas o son historicas).
export const SOURCE_LABELS: Record<string, string> = {
  link: "Reserva por link",
  ...Object.fromEntries(BUILTIN_SOURCES.map((s) => [s.code, s.label])),
  manual: "Agendado manualmente (registro anterior)",
  unknown: "Sin registrar",
};

export function slugifySource(label: string): string {
  const s = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return `c_${s || "otro"}`;
}

// Origenes propios de un negocio ("ALL" = todos, para el super admin). Si falta la migracion 104, lista vacia.
export async function loadCustomSources(supabase: Admin, tenantId: string | null | undefined): Promise<SourceOption[]> {
  if (!tenantId) return [];
  let q = supabase.from("client_sources").select("code, label").eq("active", true).order("created_at", { ascending: true });
  if (tenantId !== "ALL") q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error || !data) return [];
  const seen = new Set<string>();
  return (data as SourceOption[]).filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)));
}
