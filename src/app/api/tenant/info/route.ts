import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";

// GET: Get tenant info + plan features for the current user's tenant
//
// SEGURIDAD (25-sep): esta ruta confiaba directo en el tenantId de la URL sin verificar
// que perteneciera al usuario logueado (mismo patron inseguro ya corregido en otras ~21
// rutas) — cualquier usuario autenticado podia leer nombre/plan/estado de prueba/tema de
// CUALQUIER negocio con solo cambiar el tenantId en la peticion. Ahora se resuelve contra
// el negocio real del usuario (o el override activo, si es super_admin).
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ tenant: null, features: [] });
  }

  // Get tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, plan, status, max_professionals, max_branches, trial_ends_at, theme, onboarding_completed, onboarding_step")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return NextResponse.json({ tenant: null, features: [] });
  }

  // Get plan features
  const { data: planConfig } = await supabase
    .from("plan_limits")
    .select("features")
    .eq("plan", tenant.plan)
    .single();

  const features: string[] = planConfig?.features ? JSON.parse(planConfig.features) : [];

  return NextResponse.json({ tenant, features });
}
