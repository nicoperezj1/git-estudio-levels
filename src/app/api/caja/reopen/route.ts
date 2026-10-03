import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

// POST: Reopen a closed cash register for today (exceptional case)
export async function POST() {
  // SEGURIDAD: antes no pedia sesion y reabria la caja de cualquier negocio. Ahora solo
  // administracion/recepcion, y solo la caja de su propio negocio.
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (role !== "admin" && role !== "super_admin" && role !== "receptionist") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (role !== "super_admin" && !tenantId) {
    return NextResponse.json({ error: "No se pudo identificar el negocio" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const today = todayInChile();

  // Find today's closed register (de su negocio)
  let regQuery = supabase
    .from("cash_register")
    .select("id, status")
    .eq("date", today)
    .eq("status", "closed");
  if (role !== "super_admin") regQuery = regQuery.eq("tenant_id", tenantId as string);
  const { data: register } = await regQuery.maybeSingle();

  if (!register) {
    return NextResponse.json({ error: "No hay caja cerrada para hoy" }, { status: 404 });
  }

  // Reopen: set status back to open, clear closing data. The column is `notes` (not
  // `closing_notes`, which doesn't exist — that's what the "Could not find the
  // 'closing_notes' column" error was).
  const { error } = await supabase
    .from("cash_register")
    .update({
      status: "open",
      closed_at: null,
      closing_amount: null,
      difference: null,
      expected_amount: null,
      notes: "REABIERTA - " + new Date().toLocaleTimeString("es-CL"),
    })
    .eq("id", register.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "Caja reabierta" });
}
