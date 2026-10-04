import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { pinOr } from "@/lib/pin";

// Verifica el PIN de un administrador DEL MISMO NEGOCIO de quien hace la peticion (con sesion).
// Antes las rutas de ajustes buscaban el PIN entre los administradores de TODOS los negocios y sin
// sesion: sirvia el PIN de otro negocio y fallaba si dos admins compartian PIN.
// Freno contra adivinar el PIN: 8 fallos cada 10 minutos por usuario (en memoria, mejor esfuerzo).
const attempts = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;

export type AdminPinResult =
  | { ok: true; admin: { id: string; name: string }; userId: string; role: string | null; tenantId: string | null }
  | { ok: false; response: NextResponse };

export async function verifyAdminPin(pin: unknown): Promise<AdminPinResult> {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  const fail = (error: string, status: number) => ({ ok: false as const, response: NextResponse.json({ error }, { status }) });
  if (!userId) return fail("No autorizado", 401);

  const now = Date.now();
  const rec = attempts.get(userId);
  if (rec && now - rec.first < WINDOW_MS && rec.n >= MAX_FAILS) return fail("Demasiados intentos. Espera unos minutos.", 429);

  const p = typeof pin === "string" ? pin : String(pin ?? "");
  if (!/^\d{4}$/.test(p)) return fail("El PIN debe ser de 4 dígitos", 400);

  const sb = createAdminSupabase();
  let q = sb.from("profiles").select("id, name")
    .in("role", ["admin", "super_admin"]).or(await pinOr(sb, p)).eq("active", true).limit(1);
  if (role !== "super_admin") {
    if (!tenantId) return fail("No autorizado", 403);
    q = q.eq("tenant_id", tenantId);
  }
  const { data } = await q;
  const admin = data?.[0];
  if (!admin) {
    const fresh = rec && now - rec.first < WINDOW_MS ? rec : { n: 0, first: now };
    attempts.set(userId, { n: fresh.n + 1, first: fresh.first });
    return fail("PIN incorrecto o no tiene permisos", 401);
  }
  attempts.delete(userId);
  return { ok: true, admin, userId, role, tenantId };
}

// ¿El profesional pertenece al negocio de quien opera? (super_admin puede con cualquiera)
export async function barberInTenant(barberId: string, role: string | null, tenantId: string | null): Promise<boolean> {
  if (role === "super_admin") return true;
  if (!tenantId) return false;
  const { data } = await createAdminSupabase().from("profiles").select("tenant_id").eq("id", barberId).maybeSingle();
  return data?.tenant_id === tenantId;
}
