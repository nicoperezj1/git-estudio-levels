import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

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

  // plan_limits.features es JSONB: supabase-js lo devuelve ya como array. Antes se hacia
  // JSON.parse() directo, que revienta (500 sin cuerpo) cuando llega un array; aqui se
  // aceptan ambas formas (array o string JSON) y nunca se lanza.
  const rawFeatures: unknown = planConfig?.features;
  let features: string[] = [];
  if (Array.isArray(rawFeatures)) {
    features = rawFeatures as string[];
  } else if (typeof rawFeatures === "string") {
    try {
      const parsed = JSON.parse(rawFeatures);
      if (Array.isArray(parsed)) features = parsed;
    } catch {
      features = [];
    }
  }

  // Tema propio del usuario (migracion 086). Si la columna aun no existe en la base o falla
  // la consulta, se ignora y se usa el tema del negocio: nunca debe romper la carga.
  let userTheme: "light" | "dark" | null = null;
  try {
    const { userId } = await getCurrentUserRoleAndTenant();
    if (userId) {
      const { data: prof, error } = await supabase.from("profiles").select("theme").eq("id", userId).single();
      if (!error && (prof?.theme === "light" || prof?.theme === "dark")) userTheme = prof.theme;
    }
  } catch {
    userTheme = null;
  }

  return NextResponse.json({ tenant, features, userTheme });
}
