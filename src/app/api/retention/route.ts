import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { getInactiveClients } from "@/lib/retention";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const days = Math.max(1, parseInt(searchParams.get("days") || "30") || 30);

  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ clients: [], stats: { total: 0, inactive: 0, percentage: 0, contactable: 0 } });
  }

  // La logica de "quien esta inactivo" vive en lib/retention (compartida con el envio masivo).
  const { total, inactive } = await getInactiveClients(supabase, tenantId, days);

  return NextResponse.json({
    clients: inactive,
    stats: {
      total,
      inactive: inactive.length,
      percentage: total > 0 ? Math.round((inactive.length / total) * 100) : 0,
      contactable: inactive.filter((c) => c.email || c.phone).length,
    },
  });
}
