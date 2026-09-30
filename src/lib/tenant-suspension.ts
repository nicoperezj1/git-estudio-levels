// Un negocio suspendido por falta de pago no debe recibir reservas nuevas desde los
// flujos publicos (la pagina de reservas, el deposito y la lista de espera).
export const TENANT_SUSPENDED_MESSAGE = "Este negocio no está recibiendo reservas por el momento.";

export async function isTenantSuspended(supabase: any, tenantId: string | null | undefined) {
  if (!tenantId) return false;
  const { data } = await supabase.from("tenants").select("status").eq("id", tenantId).maybeSingle();
  return data?.status === "suspended";
}

export async function isBarberTenantSuspended(supabase: any, barberId: string | null | undefined) {
  if (!barberId) return false;
  const { data } = await supabase.from("profiles").select("tenant_id").eq("id", barberId).maybeSingle();
  return isTenantSuspended(supabase, data?.tenant_id);
}
