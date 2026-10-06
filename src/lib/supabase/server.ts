import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (error) {}
        },
      },
    }
  );
}

// Admin client with service role (bypasses RLS, no cookies needed)
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Resolve the current caller's role + tenant for server-side authorization checks.
// Uses getUser() (validated) and falls back to getSession(). Returns nulls if unknown.
type CallerInfo = { userId: string | null; role: string | null; tenantId: string | null };

// Memoria corta (10 s) del resultado, por sesion. Una sola pantalla dispara varias rutas
// a la vez y cada una repetia getUser() (llamada de red a Supabase Auth) + la consulta del
// perfil, y varias rutas lo llaman dos veces (isManagerLevel + resolveTenantForRequest).
// La clave incluye las cookies de sesion (con el token), asi que no se puede falsear; un
// cambio de rol o un cierre de sesion tarda como maximo 10 s en notarse en la misma
// instancia. Solo se guardan sesiones validas (nunca "no autorizado").
const CALLER_TTL_MS = 10_000;
const callerCache = new Map<string, { at: number; value: CallerInfo }>();

export async function getCurrentUserRoleAndTenant(): Promise<CallerInfo> {
  let key = "";
  try {
    key = cookies().toString();
  } catch {}
  if (key) {
    const hit = callerCache.get(key);
    if (hit && Date.now() - hit.at < CALLER_TTL_MS) return hit.value;
  }
  const value = await loadCallerRoleAndTenant();
  if (key && value.userId) {
    if (callerCache.size > 200) callerCache.clear();
    callerCache.set(key, { at: Date.now(), value });
  }
  return value;
}

async function loadCallerRoleAndTenant(): Promise<CallerInfo> {
  try {
    const supabase = createServerSupabase();
    let userId: string | null = null;

    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id || null;
    if (!userId) {
      const { data: sessionData } = await supabase.auth.getSession();
      userId = sessionData.session?.user?.id || null;
    }
    if (!userId) return { userId: null, role: null, tenantId: null };

    const admin = createAdminSupabase();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", userId)
      .single();

    return { userId, role: profile?.role || null, tenantId: profile?.tenant_id || null };
  } catch {
    return { userId: null, role: null, tenantId: null };
  }
}

// Server-side role gate for business-wide data (reports, dashboard, finances).
// Returns true only if the caller is an owner/manager-level role. A professional
// (barber) or client must never get whole-business figures from these endpoints —
// blocking it in the UI is not enough, the API itself has to refuse.
export async function isManagerLevel(): Promise<{ ok: boolean; role: string | null; tenantId: string | null; userId: string | null }> {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  const ok = role === "admin" || role === "super_admin" || role === "receptionist";
  return { ok, role, tenantId, userId };
}

// Authorize a client-supplied tenantId before using it in a query.
//
// SECURITY: API routes used to take `?tenantId=` straight from the browser and query
// with it, with no check that the caller belongs to that business. That let any signed-in
// user read another business's clients, services, sales and settings just by changing
// the id — and it's what actually caused the leak where an Estudio Levels admin saw
// Saray Business clients and services (a stale super_admin tenant override left in
// localStorage kept sending the other business's id, and the API answered happily).
//
// Rules:
//   - super_admin: may target any business (that's the whole point of the role), or
//     "ALL" when no specific one is requested.
//   - everyone else: the requested id is IGNORED and replaced by the caller's own
//     tenant. Fail-safe by design — a wrong/stale id can never widen access, it just
//     returns the caller's own data.
export async function resolveTenantForRequest(
  requestedTenantId?: string | null
): Promise<{ tenantId: string | null; role: string | null; denied: boolean }> {
  const { userId, role, tenantId: callerTenantId } = await getCurrentUserRoleAndTenant();

  if (!userId) return { tenantId: null, role: null, denied: true };

  if (role === "super_admin") {
    return { tenantId: requestedTenantId || "ALL", role, denied: false };
  }

  const denied = !!requestedTenantId && requestedTenantId !== callerTenantId;
  if (denied) {
    console.warn(
      `[tenant-guard] ${role} ${userId} requested tenant ${requestedTenantId} but belongs to ${callerTenantId}. Forcing own tenant.`
    );
  }

  return { tenantId: callerTenantId, role, denied };
}

// Authorize access to ONE professional's data (agenda with client names/phones, weekly
// schedule). These endpoints took `?barberId=` with no login check at all, so anyone
// with a professional's id could read their clients or overwrite their schedule.
// Allowed: super_admin, or a signed-in user of the same business as that professional.
export async function canAccessBarber(barberId: string): Promise<boolean> {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return false;
  if (role === "super_admin") return true;
  if (!tenantId) return false;
  const { data: barber } = await createAdminSupabase()
    .from("profiles")
    .select("tenant_id")
    .eq("id", barberId)
    .single();
  return barber?.tenant_id === tenantId;
}

// Authorize MANAGING a professional's account (profile edit, role, password reset,
// delete). The /api/barberos routes ran with the service role and no login check, so
// anyone could edit/delete professionals, reset passwords or create a super_admin.
// Returns who the caller is so routes can apply finer rules (self vs manager).
export async function authorizeBarberManagement(
  barberId: string | null,
  opts: { allowSelf?: boolean } = {}
): Promise<{ ok: boolean; self: boolean; role: string | null; tenantId: string | null; userId: string | null }> {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  const deny = { ok: false, self: false, role, tenantId, userId };
  if (!userId) return deny;
  if (role === "super_admin") return { ok: true, self: false, role, tenantId, userId };
  if (role === "admin" || role === "receptionist") {
    if (!barberId) return { ok: !!tenantId, self: false, role, tenantId, userId };
    const { data: barber } = await createAdminSupabase()
      .from("profiles")
      .select("tenant_id")
      .eq("id", barberId)
      .single();
    if (barber?.tenant_id && barber.tenant_id === tenantId) return { ok: true, self: false, role, tenantId, userId };
  }
  // A plain professional may only touch their own profile (routes limit the fields).
  if (barberId && opts.allowSelf && userId === barberId) return { ok: true, self: true, role, tenantId, userId };
  return deny;
}

// Get the current user's tenant_id from the session
// Returns: tenant_id string, "ALL" for super_admin, or null if can't determine
export async function getCurrentTenantId(): Promise<string | null> {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      // Try getUser as fallback
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const adminSupabase = createAdminSupabase();
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("tenant_id, role")
        .eq("id", user.id)
        .single();

      // Super admin sees everything
      if (profile?.role === "super_admin") return "ALL";
      return profile?.tenant_id || null;
    }

    const adminSupabase = createAdminSupabase();
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", session.user.id)
      .single();

    // Super admin sees everything
    if (profile?.role === "super_admin") return "ALL";
    return profile?.tenant_id || null;
  } catch (e) {
    console.error("getCurrentTenantId error:", e);
    return null;
  }
}


// ---------------------------------------------------------------------------------
// Guardas de autorizacion para rutas API (el middleware NO exige sesion en /api/*).
// ---------------------------------------------------------------------------------

type GuardFail = { ok: false; response: NextResponse };

// Exige sesion y que el rol del usuario este en `allowed`.
export async function requireRole(allowed: string[]): Promise<
  GuardFail | { ok: true; userId: string; role: string; tenantId: string | null }
> {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (!role || !allowed.includes(role)) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  return { ok: true, userId, role, tenantId };
}

// Igual que requireRole, y ademas resuelve el negocio sobre el que se puede operar:
// el del propio usuario; solo super_admin puede indicar otro (y debe indicarlo).
export async function requireTenantRole(
  allowed: string[],
  requestedTenantId?: string | null
): Promise<GuardFail | { ok: true; userId: string; role: string; tenantId: string }> {
  const g = await requireRole(allowed);
  if (!g.ok) return g;
  const tenantId = g.role === "super_admin" ? requestedTenantId || null : g.tenantId;
  if (!tenantId || tenantId === "ALL") {
    return { ok: false, response: NextResponse.json({ error: "tenantId required" }, { status: 400 }) };
  }
  return { ok: true, userId: g.userId, role: g.role, tenantId };
}

// Autoriza el acceso al perfil de UN profesional. Nivel de acceso:
//   super_admin  -> todo
//   admin        -> perfiles de su mismo negocio (nunca el de un super_admin)
//   receptionist -> perfiles de su negocio, solo lectura y datos de presentacion
//   self         -> su propio perfil
export type ProfileLevel = "super_admin" | "admin" | "receptionist" | "self";
export async function authorizeProfileAccess(targetId: string): Promise<
  GuardFail | {
    ok: true;
    level: ProfileLevel;
    userId: string;
    role: string;
    tenantId: string | null;
    target: { id: string; tenant_id: string | null; role: string; email: string | null };
  }
> {
  const caller = await getCurrentUserRoleAndTenant();
  if (!caller.userId) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const { data: target } = await createAdminSupabase()
    .from("profiles")
    .select("id, tenant_id, role, email")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) {
    return { ok: false, response: NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 }) };
  }

  const isSelf = caller.userId === targetId;
  const sameTenant = !!caller.tenantId && target.tenant_id === caller.tenantId;
  let level: ProfileLevel | null = null;
  if (caller.role === "super_admin") level = "super_admin";
  else if (target.role === "super_admin") level = isSelf ? "self" : null;
  else if (sameTenant && caller.role === "admin") level = "admin";
  else if (isSelf) level = "self";
  else if (sameTenant && caller.role === "receptionist") level = "receptionist";

  if (!level) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  return { ok: true, level, userId: caller.userId, role: caller.role || "", tenantId: caller.tenantId, target };
}
