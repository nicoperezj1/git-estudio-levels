import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

// Bug (reportado por Nico, 27-sep): "dato exacto" de retencion — daysSinceVisit se
// calculaba con new Date(sinceRef).getTime() vs Date.now(), mezclando una fecha
// calendario pura (appointments.date, sin hora ni zona) contra un instante UTC. Como
// Chile esta detras de UTC, eso corre el conteo unas horas y puede hacer que un cliente
// se vea inactivo (o activo) un dia antes/despues de lo real justo en el borde de la
// medianoche chilena — el mismo tipo de bug ya corregido en Caja (ver lib/utils.ts).
// Se resuelve comparando siempre fechas-calendario de Chile, nunca instantes UTC.
function toChileDateStr(value: string): string {
  // Un DATE puro (YYYY-MM-DD, sin hora) no tiene ambiguedad de zona horaria — se usa tal
  // cual. Un TIMESTAMPTZ (con hora) se convierte al dia calendario de Chile.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(value));
}

function daysBetweenDateStrs(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((from - to) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const days = parseInt(searchParams.get("days") || "30");

  // Get all clients with their last appointment date
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, phone, created_at")
    .eq("tenant_id", tenantId || "");

  if (!clients || clients.length === 0) {
    return NextResponse.json({ clients: [], stats: { total: 0, inactive: 0 } });
  }

  // Punto 13 (Pablo): las metricas de retencion no deben considerar periodos
  // anteriores a la fecha en que el negocio realmente empezo a usar re-booking (para
  // Estudio Levels, fijada en 1 de septiembre 2026). Para negocios nuevos, sin fecha
  // explicita, se usa automaticamente su tenants.created_at.
  let retentionStartDate: string | null = null;
  if (tenantId && tenantId !== "ALL") {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("retention_start_date, created_at")
      .eq("id", tenantId)
      .single();
    retentionStartDate = tenantRow?.retention_start_date || tenantRow?.created_at || null;
  }

  // Get last completed appointment for each client, scoped to this tenant and to the
  // retention window (visitas anteriores a retentionStartDate no cuentan como "ultima
  // visita real" — ver comentario arriba).
  let apptQuery = supabase
    .from("appointments")
    .select("client_id, date")
    .eq("status", "completed")
    .order("date", { ascending: false });
  if (tenantId && tenantId !== "ALL") apptQuery = apptQuery.eq("tenant_id", tenantId);
  if (retentionStartDate) apptQuery = apptQuery.gte("date", retentionStartDate);
  const { data: appointments } = await apptQuery;

  // Build map of last visit per client
  const lastVisitMap: Record<string, string> = {};
  for (const appt of appointments || []) {
    if (!lastVisitMap[appt.client_id]) {
      lastVisitMap[appt.client_id] = appt.date;
    }
  }

  // Get total visits count per client
  const visitCountMap: Record<string, number> = {};
  for (const appt of appointments || []) {
    visitCountMap[appt.client_id] = (visitCountMap[appt.client_id] || 0) + 1;
  }

  // Filter inactive clients
  const inactiveClients = clients
    .map((client) => {
      // When there's no visit within the retention window, the "days since" clock
      // should never start earlier than retentionStartDate — otherwise a client whose
      // account predates go-live (import, testing, etc.) would look artificially
      // ancient/inactive from day one, distorting the stats the same way a real
      // pre-launch visit would if it were still being counted.
      let sinceRefDateStr = lastVisitMap[client.id] || toChileDateStr(client.created_at);
      if (!lastVisitMap[client.id] && retentionStartDate) {
        const retentionStartDateStr = toChileDateStr(retentionStartDate);
        if (sinceRefDateStr < retentionStartDateStr) sinceRefDateStr = retentionStartDateStr;
      }
      return {
        ...client,
        lastVisit: lastVisitMap[client.id] || null,
        totalVisits: visitCountMap[client.id] || 0,
        daysSinceVisit: daysBetweenDateStrs(todayInChile(), sinceRefDateStr),
      };
    })
    .filter((c) => c.daysSinceVisit >= days)
    .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);

  return NextResponse.json({
    clients: inactiveClients,
    stats: {
      total: clients.length,
      inactive: inactiveClients.length,
      percentage: Math.round((inactiveClients.length / clients.length) * 100),
    },
  });
}
