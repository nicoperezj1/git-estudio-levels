import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Freno contra adivinar el PIN (4 digitos = 10.000 combinaciones): maximo 8 intentos fallidos
// cada 10 minutos por usuario. Es en memoria (mejor esfuerzo; en Vercel cada instancia lleva su
// propia cuenta), asi que no reemplaza un limite real, pero corta el ataque por fuerza bruta simple.
const attempts = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;

// POST: Verify admin PIN for discount authorization
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion y probaba el PIN contra los administradores de TODOS los
  // negocios. Ahora hace falta sesion y solo cuentan los administradores del mismo negocio.
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ valid: false, error: "No autorizado" }, { status: 401 });

  const now = Date.now();
  const rec = attempts.get(userId);
  if (rec && now - rec.first < WINDOW_MS && rec.n >= MAX_FAILS) {
    return NextResponse.json({ valid: false, error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
  }

  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({} as any));
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ valid: false, error: "PIN debe ser de 4 digitos" }, { status: 400 });
  }

  let q = supabase
    .from("profiles")
    .select("id, name")
    .in("role", ["admin", "super_admin"])
    .eq("personal_pin", pin)
    .eq("active", true)
    .limit(1);
  if (role !== "super_admin") {
    if (!tenantId) return NextResponse.json({ valid: false, error: "No autorizado" }, { status: 403 });
    q = q.eq("tenant_id", tenantId);
  }
  const { data } = await q;
  const admin = data?.[0];

  if (!admin) {
    const fresh = rec && now - rec.first < WINDOW_MS ? rec : { n: 0, first: now };
    attempts.set(userId, { n: fresh.n + 1, first: fresh.first });
    return NextResponse.json({ valid: false, error: "PIN incorrecto" }, { status: 401 });
  }

  attempts.delete(userId);
  return NextResponse.json({ valid: true, adminName: admin.name, adminId: admin.id });
}
