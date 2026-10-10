import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { loadCustomSources } from "@/lib/client-sources";

// Punto 10 (Pablo): "Metricas" en Clientes — diferenciar el origen de cada CLIENTE
// (reserva por link / agendado manualmente / desde promociones / sin registrar) para
// remarketing, seguimiento y reseñas. Visible solo para Administrador y Recepcion.
//
// Segunda vuelta: la version original derivaba el origen de la primera CITA del
// cliente, asi que cualquier cliente sin citas (alta manual sin agendar todavía,
// importacion CSV/Excel masiva, base historica) quedaba afuera de Metricas por
// completo — por eso aparecia vacia. Ahora el origen vive en clients.acquisition_source,
// fijado una sola vez al crear el cliente (ver migracion 069), y la consulta recorre
// TODOS los clientes del negocio, no solo los que ya tuvieron una cita.

// Segunda vuelta (26-sep, Pablo): la recepcion siempre pregunta el origen del cliente,
// asi que "Agendado manualmente" (generico) se reemplaza por canales especificos.
// "manual" se deja mapeado para no perder el historial de clientes cargados antes de
// este cambio (quedan agrupados bajo su propia etiqueta, no se migran ni se pierden).
const SOURCE_LABELS: Record<string, string> = {
  link: "Reserva por link",
  walk_in: "Pasó por fuera",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  referral: "Referido de un amigo/conocido",
  google_maps: "Google Maps",
  promotion: "Promoción",
  influencer: "Influencer",
  manual: "Agendado manualmente (registro anterior)",
  unknown: "Sin registrar",
};

// Casillas por origen: las de siempre + los origenes propios del negocio.
const EMPTY_SOURCE_BUCKETS = (extra: string[] = []) => ({
  link: [] as any[], walk_in: [] as any[], instagram: [] as any[], tiktok: [] as any[],
  facebook: [] as any[], referral: [] as any[],
  google_maps: [] as any[], promotion: [] as any[], influencer: [] as any[],
  ...Object.fromEntries(extra.map((k) => [k, [] as any[]])),
  manual: [] as any[], unknown: [] as any[],
}) as Record<string, any[]>;

export async function GET(req: NextRequest) {
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminSupabase();

  // SEGURIDAD: el tenantId de la URL nunca se usa directo (ver comentario en
  // resolveTenantForRequest) — para cualquier rol que no sea super_admin, el id pedido
  // se ignora y se reemplaza por el propio negocio del usuario logueado. Antes esta
  // ruta usaba getTenantFromRequest(), que SI confiaba en el parametro de la URL sin
  // verificar que perteneciera al usuario — un admin de un negocio podia ver los
  // clientes de otro cambiando el tenantId en la peticion.
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied) {
    return NextResponse.json({ error: "No autorizado para ese negocio" }, { status: 403 });
  }
  if (!tenantId) {
    return NextResponse.json({ summary: [], monthly: [], clientsBySource: EMPTY_SOURCE_BUCKETS() });
  }

  // Origenes propios del negocio ("+ Crear otra opcion"): se suman a las casillas y a las etiquetas.
  const custom = await loadCustomSources(supabase, tenantId);
  const labels: Record<string, string> = { ...SOURCE_LABELS, ...Object.fromEntries(custom.map((c) => [c.code, c.label])) };

  // Supabase devuelve como maximo 1.000 filas por consulta; sin paginar, solo se leian
  // los primeros 1.000 clientes (los mas antiguos/importados) y los nuevos nunca se
  // contaban. Se lee por paginas hasta traer todos. El orden incluye "id" para que las
  // paginas no se solapen entre si cuando varios clientes comparten created_at.
  const PAGE = 1000;
  const clients: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("clients")
      .select("id, name, email, phone, acquisition_source, acquisition_detail, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (tenantId !== "ALL") query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "No se pudieron leer los clientes" }, { status: 500 });
    }
    clients.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  // Agrupa clientes por origen.
  const bySource: Record<string, Array<{ id: string; name: string; email: string | null; phone: string | null; firstVisit: string; detail: string | null }>> = EMPTY_SOURCE_BUCKETS(custom.map((c) => c.code));
  for (const c of clients || []) {
    const key = c.acquisition_source && bySource[c.acquisition_source] ? c.acquisition_source : "unknown";
    bySource[key].push({
      id: c.id, name: c.name, email: c.email, phone: c.phone,
      firstVisit: (c.created_at || "").slice(0, 10),
      detail: c.acquisition_detail || null,
    });
  }
  for (const key of Object.keys(bySource)) {
    bySource[key].sort((a, b) => (a.firstVisit < b.firstVisit ? 1 : -1)); // mas recientes primero
  }

  const total = clients?.length || 0;
  const summary = Object.entries(bySource).map(([source, list]) => ({
    source,
    label: labels[source] || source,
    count: list.length,
    percent: total > 0 ? Math.round((list.length / total) * 1000) / 10 : 0,
  }));

  // Tendencia: clientes nuevos por mes (ultimos 6 meses, segun fecha de registro),
  // desglosados por origen — para ver si un cambio (ej. una campaña) esta moviendo el
  // canal de captacion.
  const monthly: Array<Record<string, string | number>> = [];
  const monthNamesShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [chileYear, chileMonth1] = todayInChile().split("-").map(Number);
  const chileMonth = chileMonth1 - 1; // 0-indexed, para comparar con getUTCMonth()
  for (let i = 5; i >= 0; i--) {
    // Resta i meses en aritmetica entera de mes/año (no dias), asi cada bucket cae en
    // un mes calendario distinto sin importar cuantos dias tenga cada mes.
    let m = chileMonth - i;
    let y = chileYear;
    while (m < 0) { m += 12; y--; }
    const label = `${monthNamesShort[m]} ${String(y).slice(2)}`;
    const bucket = { label, ...Object.fromEntries(Object.keys(bySource).map((k) => [k, 0])) };
    for (const c of clients || []) {
      if (!c.created_at) continue;
      const cd = new Date(c.created_at);
      if (cd.getUTCFullYear() === y && cd.getUTCMonth() === m) {
        const key = c.acquisition_source && bucket.hasOwnProperty(c.acquisition_source) ? c.acquisition_source : "unknown";
        (bucket as any)[key]++;
      }
    }
    monthly.push(bucket);
  }

  return NextResponse.json({
    summary,
    monthly,
    clientsBySource: bySource,
  });
}
