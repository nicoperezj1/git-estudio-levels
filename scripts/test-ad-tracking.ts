import { sanitizeAttribution, buildTrackedLink, slugifyAd, isAdTrackingEnabled } from "../src/lib/ad-tracking";
let fails = 0;
const t = (name: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log("FALLA", name, JSON.stringify(got), "esperado", JSON.stringify(want)); } else console.log("ok", name); };

t("slug sin tildes ni espacios", slugifyAd("Campaña Octubre ñandú!"), "campana-octubre-nandu");
t("nada util -> null", sanitizeAttribution({ foo: "x" }), null);
t("no objeto -> null", sanitizeAttribution("hola"), null);
const a = sanitizeAttribution({ utm_source: "Meta", utm_campaign: "Agenda Barberos Oct", utm_content: "Reel 1", fbclid: "ABC123", evil: "x", landing: "/b/estudiolevels" }) as any;
t("normaliza utm", [a.utm_source, a.utm_campaign, a.utm_content], ["meta", "agenda-barberos-oct", "reel-1"]);
t("conserva fbclid tal cual", a.fbclid, "ABC123");
t("ignora claves ajenas", "evil" in a, false);
t("guarda landing", a.landing, "/b/estudiolevels");
const long = sanitizeAttribution({ utm_campaign: "a".repeat(500), fbclid: "b".repeat(500) }) as any;
t("recorta utm a 80", long.utm_campaign.length, 80);
t("recorta fbclid a 200", long.fbclid.length, 200);
t("link con utm", buildTrackedLink("https://x.cl/b/negocio", { medium: "paid", campaign: "Agenda Octubre", content: "Reel A" }), "https://x.cl/b/negocio?utm_source=meta&utm_medium=paid&utm_campaign=agenda-octubre&utm_content=reel-a");
t("link con ? previo", buildTrackedLink("https://x.cl/b/n?x=1", { medium: "organic_bio", campaign: "bio" }), "https://x.cl/b/n?x=1&utm_source=meta&utm_medium=organic_bio&utm_campaign=bio");
(async () => {
  const mk = (res: any) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) }) as any;
  t("apagado si falta la migracion", await isAdTrackingEnabled(mk({ data: null, error: { message: "column does not exist" } }), "t1"), false);
  t("apagado por defecto", await isAdTrackingEnabled(mk({ data: { ad_tracking_enabled: false }, error: null }), "t1"), false);
  t("encendido", await isAdTrackingEnabled(mk({ data: { ad_tracking_enabled: true }, error: null }), "t1"), true);
  t("sin negocio", await isAdTrackingEnabled(mk({ data: { ad_tracking_enabled: true }, error: null }), null), false);
  console.log(fails ? `${fails} fallas` : "TODO OK");
  process.exit(fails ? 1 : 0);
})();
