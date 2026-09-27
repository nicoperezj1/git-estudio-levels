import { createAdminSupabase } from "@/lib/supabase/server";

// Item 34 (Nico, 26-sep): "matriz de accesos por plan" — que modulo/feature se oculta o
// bloquea segun el plan contratado (Basic/Starter/Pro/Enterprise), en base a la tabla de
// precios del landing (public/landing-nuevo/index.html, seccion de planes).
//
// La pieza de datos ya existia a medias: plan_limits.features (JSONB, migracion 028/030) y
// un hasPlanFeature() en TenantProvider (src/lib/tenant-context.tsx) que lee ese arreglo —
// pero nada llamaba a hasPlanFeature todavia (ningun modulo estaba realmente gateado) y los
// valores de features estaban desalineados con el landing actual (ej. Starter tenia
// "cash_register"/"loyalty" que el landing marca como NO incluidos en Starter). La
// migracion 076 corrige esos valores; este archivo es el lado servidor del mismo chequeo
// (el cliente ya tiene el suyo via hasPlanFeature del TenantProvider).
//
// Las claves de feature son las mismas que plan_limits.features guarda como texto:
export type PlanFeature =
  | "whatsapp_bulk" // "Mensajes masivos" / "Acceso a mensajes masivos"
  | "client_files" // "Fichas para el cliente"
  | "coupons" // "Cupones de descuento"
  | "pos" // "Integración con sistemas de pagos (POS)"
  | "cash_register" // "Módulo de caja"
  | "loyalty" // "Sistema de fidelización"
  | "custom_colors" // "Personalización de colores"
  | "commissions" // "Modalidad ... % de comisión de profesionales"
  | "rental" // "Modalidad arriendo de estación"
  | "invoices" // "Añadir facturas"
  | "inventory" // "Inventario"
  | "multi_branch"; // "Multi-sucursal"

// Nombre en español para el mensaje de error/upsell cuando el servidor bloquea algo.
export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  whatsapp_bulk: "Mensajes masivos",
  client_files: "Fichas para el cliente",
  coupons: "Cupones de descuento",
  pos: "Integracion con sistemas de pago (POS)",
  cash_register: "Modulo de Caja",
  loyalty: "Sistema de fidelizacion",
  custom_colors: "Personalizacion de colores",
  commissions: "Comisiones de profesionales",
  rental: "Arriendo de estacion",
  invoices: "Facturas",
  inventory: "Inventario",
  multi_branch: "Multi-sucursal",
};

/**
 * Si el negocio (por su plan actual, o un override futuro si se agrega) tiene acceso a
 * `feature`. Mismo criterio que el cliente (TenantProvider.hasPlanFeature): lee
 * plan_limits.features del plan del tenant. tenantId=null o negocio inexistente -> false
 * (a diferencia del cliente, que devuelve true para "sin tenant" porque asume super_admin;
 * del lado del servidor cada ruta ya sabe si esta actuando sobre un tenant real).
 */
export async function tenantHasFeature(tenantId: string | null | undefined, feature: PlanFeature): Promise<boolean> {
  if (!tenantId || tenantId === "ALL") return false;
  const supabase = createAdminSupabase();
  const { data: tenant } = await supabase.from("tenants").select("plan").eq("id", tenantId).single();
  if (!tenant?.plan) return false;

  const { data: planRow } = await supabase.from("plan_limits").select("features").eq("plan", tenant.plan).single();
  if (!planRow?.features) return false;
  const features: string[] = typeof planRow.features === "string" ? JSON.parse(planRow.features) : planRow.features;
  return features.includes(feature);
}
