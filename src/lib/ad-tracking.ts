// Seguimiento de publicidad (nivel 1, migracion 110). Misma convencion de etiquetas (UTM) para TODOS los negocios.
// El link del anuncio lleva utm_*; la pagina de reservas los guarda en el navegador y los manda al reservar;
// el servidor los limpia aqui y los guarda en la cita (appointments.ad_attribution) y en el cliente nuevo.
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;

// Parametros que se guardan (cualquier otro se ignora). fbclid lo agrega Meta solo a los links de anuncios.
export const AD_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid"] as const;
export type AdParam = (typeof AD_PARAMS)[number];
export type AdAttribution = Partial<Record<AdParam, string>> & { landing?: string; captured_at?: string };

// Convencion unica: utm_source=meta; utm_medium=paid | organic_bio | organic_story | ...
export const AD_MEDIUMS: { value: string; label: string }[] = [
  { value: "paid", label: "Anuncio pagado" },
  { value: "organic_bio", label: "Link de la biografía de Instagram" },
  { value: "organic_story", label: "Historia o publicación sin pagar" },
];

// "Campaña Octubre ñandú!" -> "campana-octubre-nandu". Se usa en etiquetas, para que cualquier nombre sirva.
export function slugifyAd(value: string, max = 80): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_{}.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}

// Limpia lo que manda el navegador. Devuelve null si no hay nada util. Nunca confia en el largo ni en las claves.
export function sanitizeAttribution(input: unknown): AdAttribution | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: AdAttribution = {};
  for (const key of AD_PARAMS) {
    const raw = src[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    out[key] = key === "fbclid" ? raw.trim().slice(0, 200) : slugifyAd(raw.trim());
    if (!out[key]) delete out[key];
  }
  if (!Object.keys(out).length) return null;
  if (typeof src.landing === "string") out.landing = src.landing.slice(0, 120);
  out.captured_at = new Date().toISOString();
  return out;
}

// ¿El negocio activo el seguimiento? Si falta la migracion o hay error, se considera apagado.
export async function isAdTrackingEnabled(supabase: Admin, tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId || tenantId === "ALL") return false;
  const { data, error } = await supabase.from("tenants").select("ad_tracking_enabled").eq("id", tenantId).maybeSingle();
  return !error && !!(data as any)?.ad_tracking_enabled;
}

// Arma el link de un anuncio / publicacion para un negocio. baseUrl = link de reservas (https://.../b/<negocio>).
export function buildTrackedLink(baseUrl: string, opts: { medium: string; campaign: string; content?: string; term?: string }): string {
  const params: string[] = ["utm_source=meta", `utm_medium=${slugifyAd(opts.medium) || "paid"}`];
  const c = slugifyAd(opts.campaign);
  if (c) params.push(`utm_campaign=${c}`);
  const ct = slugifyAd(opts.content || "");
  if (ct) params.push(`utm_content=${ct}`);
  const t = slugifyAd(opts.term || "");
  if (t) params.push(`utm_term=${t}`);
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.join("&")}`;
}

// Para pegar en Ads Manager > Anuncio > "Parametros de URL": Meta reemplaza {{...}} por los nombres reales.
export const META_URL_PARAMETERS =
  "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_id={{campaign.id}}";
