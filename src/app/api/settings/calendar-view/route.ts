import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Calendario "profesionales agrupados": el selector 1 / 3 / 7 dias tambien aplica a TODOS los
// profesionales a la vez. Solo para negocios de 2 a 4 profesionales (con mas, la vista se
// llena de columnas y se ve mal). Lo activa el administrador en Configuracion.
// Columna: tenants.calendar_group_week (migracion 087). Si la columna aun no existe, el
// calendario sigue funcionando normal (la opcion queda apagada).
const MIN_PROS = 2;
const MAX_PROS = 4;

// Profesionales que atienden clientes (misma regla que el Calendario): barberos activos y
// administradores marcados como "tambien atiende clientes".
async function countProfessionals(supabase: ReturnType<typeof createAdminSupabase>, tenantId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("role, also_attends_clients")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("role", ["barber", "admin", "super_admin"]);
  return (data || []).filter((p: any) => p.role === "barber" || !!p.also_attends_clients).length;
}

async function readEnabled(supabase: ReturnType<typeof createAdminSupabase>, tenantId: string): Promise<{ enabled: boolean; migrationMissing: boolean }> {
  const { data, error } = await supabase.from("tenants").select("calendar_group_week").eq("id", tenantId).single();
  if (error) return { enabled: false, migrationMissing: /column .* does not exist|schema cache/i.test(error.message) };
  return { enabled: !!(data as any)?.calendar_group_week, migrationMissing: false };
}

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ enabled: false, active: false, eligible: false, professionals: 0, min: MIN_PROS, max: MAX_PROS });
  }
  const [professionals, { enabled, migrationMissing }] = await Promise.all([
    countProfessionals(supabase, tenantId),
    readEnabled(supabase, tenantId),
  ]);
  const eligible = professionals >= MIN_PROS && professionals <= MAX_PROS;
  return NextResponse.json({
    enabled,
    eligible,
    // "active" = lo que realmente usa el calendario: encendido Y dentro del rango de equipo.
    active: enabled && eligible,
    professionals,
    min: MIN_PROS,
    max: MAX_PROS,
    migrationMissing,
  });
}

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const supabase = createAdminSupabase();

  // Apagar siempre se puede; encender solo con 2 a 4 profesionales.
  if (enabled) {
    const professionals = await countProfessionals(supabase, tenantId);
    if (professionals < MIN_PROS || professionals > MAX_PROS) {
      return NextResponse.json(
        { error: `Esta vista es solo para negocios de ${MIN_PROS} a ${MAX_PROS} profesionales (hoy tienes ${professionals}).` },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase.from("tenants").update({ calendar_group_week: enabled }).eq("id", tenantId);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 087 en la base de datos." : error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, enabled });
}
