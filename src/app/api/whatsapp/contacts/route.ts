import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

// GET: Get all clients with phones for WhatsApp broadcast
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // Never return contacts across all businesses. Without a concrete tenant, return an
  // empty list instead of everyone (this is the same cross-business leak that let one
  // business broadcast to 647 people from other salons).
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json([]);
  }

  // Get clients with phone numbers, scoped to this business.
  let query = supabase
    .from("clients")
    .select("id, name, phone, email")
    .not("phone", "is", null)
    .eq("tenant_id", tenantId);
  query = query.neq("phone", "").order("name");

  const { data: clients } = await query;

  // Ultima visita REAL de cada cliente. Mismo criterio que la pantalla de Retencion: solo
  // visitas completadas y posteriores a tenants.retention_start_date (o a la creacion del
  // negocio) — las anteriores son datos de importacion/pruebas y no son confiables.
  const clientIds = (clients || []).map((c) => c.id);
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("retention_start_date, created_at")
    .eq("id", tenantId)
    .single();
  const retentionStartDate = tenantRow?.retention_start_date || tenantRow?.created_at || null;

  const lastVisits: Record<string, string> = {};
  const upcoming = new Set<string>();
  if (clientIds.length > 0) {
    let doneQuery = supabase
      .from("appointments")
      .select("client_id, date")
      .in("client_id", clientIds)
      .eq("status", "completed")
      .order("date", { ascending: false });
    if (retentionStartDate) doneQuery = doneQuery.gte("date", retentionStartDate);
    const { data: appointments } = await doneQuery;
    for (const appt of appointments || []) {
      if (!lastVisits[appt.client_id]) lastVisits[appt.client_id] = appt.date;
    }

    // Clientes con una cita por venir (agendada/confirmada): NO son "inactivos" aunque su
    // ultima visita sea vieja, y no tiene sentido pedirles que vuelvan.
    const { data: future } = await supabase
      .from("appointments")
      .select("client_id")
      .in("client_id", clientIds)
      .in("status", ["scheduled", "confirmed", "in_progress"])
      .gte("date", todayInChile());
    for (const f of future || []) upcoming.add(f.client_id);
  }

  const result = (clients || []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    lastVisit: lastVisits[c.id] || null,
    hasUpcoming: upcoming.has(c.id),
  }));

  return NextResponse.json(result);
}
