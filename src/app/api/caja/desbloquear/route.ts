import { NextRequest, NextResponse } from "next/server";
import { pinOr } from "@/lib/pin";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// "Apagar caja" (recepcion): oculta montos y acciones de la pantalla Caja; se vuelve a encender con el
// PIN personal de la recepcionista (o del administrador). El bloqueo vive en el navegador; aca solo se
// valida el PIN, siempre contra el equipo del MISMO negocio. Maximo 8 intentos fallidos / 10 min.
const attempts = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;

export async function POST(req: NextRequest) {
  const { userId, tenantId, role } = await getCurrentUserRoleAndTenant();
  if (!userId || (!tenantId && role !== "super_admin")) return NextResponse.json({ valid: false, error: "No autorizado" }, { status: 401 });

  const now = Date.now();
  const rec = attempts.get(userId);
  if (rec && now - rec.first < WINDOW_MS && rec.n >= MAX_FAILS) {
    return NextResponse.json({ valid: false, error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as any));
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ valid: false, error: "El PIN tiene 4 dígitos" }, { status: 400 });

  const supabase = createAdminSupabase();
  let q = supabase.from("profiles").select("id, name").in("role", ["receptionist", "admin", "super_admin"])
    .or(await pinOr(supabase, pin)).eq("active", true).limit(1);
  if (role !== "super_admin") q = q.eq("tenant_id", tenantId as string);
  const { data } = await q;
  const who = data?.[0];
  if (!who) {
    const fresh = rec && now - rec.first < WINDOW_MS ? rec : { n: 0, first: now };
    attempts.set(userId, { n: fresh.n + 1, first: fresh.first });
    return NextResponse.json({ valid: false, error: "PIN incorrecto" }, { status: 401 });
  }
  attempts.delete(userId);
  return NextResponse.json({ valid: true, name: who.name });
}
