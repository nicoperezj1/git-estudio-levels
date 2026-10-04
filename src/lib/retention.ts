import type { createAdminSupabase } from "@/lib/supabase/server";
import { todayInChile, toChileDateStr, daysBetweenDateStrs } from "@/lib/utils";

// Fuente UNICA de "quien esta inactivo" — la usan la pantalla de Retencion y el envio
// masivo, para que el numero que ves en pantalla sea exactamente el que recibe el mensaje
// (antes la pantalla usaba ">= N dias" y el envio "> N dias", y no coincidian).
//
// Reglas:
//  - Solo visitas COMPLETADAS y posteriores a tenants.retention_start_date (o a la creacion
//    del negocio): las anteriores son importacion/pruebas y no son confiables (Punto 13).
//  - Si nunca hubo una visita valida, el reloj parte en la fecha de registro del cliente
//    (sin ir antes del inicio real del negocio).
//  - Un cliente con una cita por venir (agendada/confirmada/en curso) NO es inactivo.
//  - Inactivo = dias desde su ultima visita (o registro) >= N.

export interface RetentionClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  lastVisit: string | null;
  totalVisits: number;
  daysSinceVisit: number;
  hasUpcoming: boolean;
}

export async function getInactiveClients(
  supabase: ReturnType<typeof createAdminSupabase>,
  tenantId: string,
  days: number
): Promise<{ total: number; inactive: RetentionClient[] }> {
  // Ley 21.719: no se escribe a quien pidio no ser contactado ni a quien rechazo las promociones (migracion 101).
  // Si la migracion aun no esta, se trabaja como antes (sin esa marca).
  let optedOut = new Set<string>();
  let { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name, email, phone, created_at, marketing_consent, do_not_contact")
    .eq("tenant_id", tenantId);
  if (clientsErr) {
    ({ data: clients } = await supabase.from("clients").select("id, name, email, phone, created_at").eq("tenant_id", tenantId) as any);
  } else {
    optedOut = new Set((clients || []).filter((c: any) => c.do_not_contact === true || c.marketing_consent === false).map((c: any) => c.id));
  }
  if (!clients || clients.length === 0) return { total: 0, inactive: [] };

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("retention_start_date, created_at")
    .eq("id", tenantId)
    .single();
  const retentionStartDate: string | null = tenantRow?.retention_start_date || tenantRow?.created_at || null;

  const clientIds = clients.map((c) => c.id);

  let apptQuery = supabase
    .from("appointments")
    .select("client_id, date")
    .eq("status", "completed")
    .in("client_id", clientIds)
    .order("date", { ascending: false });
  if (retentionStartDate) apptQuery = apptQuery.gte("date", retentionStartDate);
  const { data: appointments } = await apptQuery;

  const lastVisitMap: Record<string, string> = {};
  const visitCountMap: Record<string, number> = {};
  for (const a of appointments || []) {
    if (!lastVisitMap[a.client_id]) lastVisitMap[a.client_id] = a.date;
    visitCountMap[a.client_id] = (visitCountMap[a.client_id] || 0) + 1;
  }

  const { data: future } = await supabase
    .from("appointments")
    .select("client_id")
    .in("client_id", clientIds)
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .gte("date", todayInChile());
  const upcoming = new Set((future || []).map((f: any) => f.client_id));

  const today = todayInChile();
  const inactive = clients
    .map((client): RetentionClient => {
      let sinceRef = lastVisitMap[client.id] || toChileDateStr(client.created_at);
      if (!lastVisitMap[client.id] && retentionStartDate) {
        const startStr = toChileDateStr(retentionStartDate);
        if (sinceRef < startStr) sinceRef = startStr;
      }
      return {
        ...client,
        lastVisit: lastVisitMap[client.id] || null,
        totalVisits: visitCountMap[client.id] || 0,
        daysSinceVisit: daysBetweenDateStrs(today, sinceRef),
        hasUpcoming: upcoming.has(client.id),
      };
    })
    .filter((c) => !c.hasUpcoming && c.daysSinceVisit >= days && !optedOut.has(c.id))
    .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);

  return { total: clients.length, inactive };
}

/** Deja un solo cliente por correo / telefono (dos fichas con el mismo dato no reciben doble mensaje). */
export function dedupeBy<T>(items: T[], key: (i: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** Link de reserva del negocio (el mismo que usa Mensajes por WhatsApp). */
export async function tenantBookingUrl(
  supabase: ReturnType<typeof createAdminSupabase>,
  tenantId: string
): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";
  const { data } = await supabase.from("tenants").select("slug").eq("id", tenantId).single();
  return data?.slug ? `${base}/b/${data.slug}` : `${base}/booking`;
}
