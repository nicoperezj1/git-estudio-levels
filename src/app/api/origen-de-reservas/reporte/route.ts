import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/accounting";

// Reservas por campana / anuncio del negocio (solo admin). Cuenta las reservas por link de los ultimos dias y, de ellas,
// cuales traian el origen de un anuncio (migracion 112). Nunca confia en un tenantId del navegador.
export async function GET(req: NextRequest) {
  const c = await getCurrentUserRoleAndTenant();
  if (!c.userId || (c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const supabase = createAdminSupabase();
  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 90));
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  let rows: any[];
  try {
    rows = await fetchAllRows<any>(() =>
      supabase.from("appointments").select("id, client_id, status, source, ad_attribution").eq("tenant_id", c.tenantId!).eq("source", "link").gte("date", since),
    );
  } catch (e: any) {
    const missing = /ad_attribution|does not exist|schema cache/i.test(String(e?.message || e));
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 112 en la base de datos." : "No se pudo cargar el reporte" }, { status: missing ? 409 : 500 });
  }

  type Row = { campaign: string; content: string; medium: string; bookings: number; completed: number; cancelled: number; clients: Set<string> };
  const groups = new Map<string, Row>();
  let untagged = 0;
  for (const r of rows) {
    const a = r.ad_attribution as Record<string, string> | null;
    if (!a) { untagged++; continue; }
    const campaign = a.utm_campaign || "(sin campaña)";
    const content = a.utm_content || "";
    const medium = a.utm_medium || "";
    const key = `${campaign}|${content}|${medium}`;
    const g = groups.get(key) || { campaign, content, medium, bookings: 0, completed: 0, cancelled: 0, clients: new Set<string>() };
    g.bookings++;
    if (r.status === "completed") g.completed++;
    if (r.status === "cancelled") g.cancelled++;
    if (r.client_id) g.clients.add(r.client_id);
    groups.set(key, g);
  }

  // Clientes NUEVOS por campana (origen fijado al crearse el cliente por link).
  const newByCampaign = new Map<string, number>();
  try {
    const clients = await fetchAllRows<any>(() =>
      supabase.from("clients").select("id, first_ad_attribution").eq("tenant_id", c.tenantId!).not("first_ad_attribution", "is", null).gte("created_at", `${since}T00:00:00`),
    );
    for (const cl of clients) {
      const camp = cl.first_ad_attribution?.utm_campaign || "(sin campaña)";
      newByCampaign.set(camp, (newByCampaign.get(camp) || 0) + 1);
    }
  } catch { /* sin la migracion 112 no hay clientes con origen */ }

  const campaigns = Array.from(groups.values())
    .map((g) => ({ campaign: g.campaign, content: g.content, medium: g.medium, bookings: g.bookings, completed: g.completed, cancelled: g.cancelled, clients: g.clients.size, newClients: newByCampaign.get(g.campaign) || 0 }))
    .sort((a, b) => b.bookings - a.bookings);

  return NextResponse.json({
    days,
    totalLinkBookings: rows.length,
    taggedBookings: rows.length - untagged,
    untaggedBookings: untagged,
    campaigns,
  });
}
