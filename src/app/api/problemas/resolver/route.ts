import { NextRequest, NextResponse } from "next/server";
import { pinOr } from "@/lib/pin";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { GET as cajaGET } from "../../caja/route";

// El administrador resuelve los problemas de caja abiertos con SU CODIGO (PIN): declara cuanto efectivo hay
// realmente y deja la glosa de la solucion. La diferencia contra lo que decia el sistema queda como "ajuste de caja"
// (suma o resta) y desde ahi la caja parte del monto real. Los reportes quedan resueltos con la glosa. El PIN se
// valida SIEMPRE en el servidor (no basta con que la pantalla lo haya aceptado antes).
const attempts = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;

export async function POST(req: NextRequest) {
  const { userId, tenantId, role } = await getCurrentUserRoleAndTenant();
  if (!userId || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const now = Date.now();
  const rec = attempts.get(userId);
  if (rec && now - rec.first < WINDOW_MS && rec.n >= MAX_FAILS) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

  const body = await req.json().catch(() => ({} as any));
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const note = String(body?.note || "").trim().slice(0, 500);
  const declared = Math.round(Number(body?.declaredCash));
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "El código tiene 4 dígitos." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Escribe la glosa de la solución." }, { status: 400 });
  if (!Number.isFinite(declared) || declared < 0 || declared > 100_000_000) return NextResponse.json({ error: "Indica cuánto efectivo hay realmente en caja." }, { status: 400 });

  const supabase = createAdminSupabase();
  let q = supabase.from("profiles").select("id, name").in("role", ["admin", "super_admin"]).or(await pinOr(supabase, pin)).eq("active", true).limit(1);
  if (role !== "super_admin") q = q.eq("tenant_id", tenantId);
  const { data: admins } = await q;
  const admin = admins?.[0];
  if (!admin) {
    const fresh = rec && now - rec.first < WINDOW_MS ? rec : { n: 0, first: now };
    attempts.set(userId, { n: fresh.n + 1, first: fresh.first });
    return NextResponse.json({ error: "Código de administrador incorrecto." }, { status: 401 });
  }
  attempts.delete(userId);

  // Lo que dice el sistema ahora (misma fuente que la pantalla Caja).
  const r = await cajaGET(new NextRequest(new URL(`/api/caja?tenantId=${tenantId}`, req.url)));
  const state = await r.json().catch(() => null);
  const expected = Number(state?.summary?.expectedCash);
  if (!Number.isFinite(expected)) return NextResponse.json({ error: "No se pudo leer la caja." }, { status: 500 });
  const diff = declared - expected;

  if (diff !== 0) {
    const { error } = await supabase.from("cash_adjustments").insert({
      tenant_id: tenantId, day: todayInChile(), amount: diff, expected_cash: Math.round(expected), declared_cash: declared, note,
      created_by: admin.id, created_by_name: admin.name,
    });
    if (error) return NextResponse.json({ error: "Falta aplicar la migración 097 en la base de datos." }, { status: 409 });
  }

  // Resolver todos los problemas de caja abiertos (con la glosa y el monto declarado).
  const full = { status: "resolved", resolved_by_name: admin.name, resolved_at: new Date().toISOString(), resolution_note: note, declared_cash: declared };
  let upd = await supabase.from("problem_reports").update(full).eq("tenant_id", tenantId).eq("status", "open")
    .in("context", ["caja", "standby", "reduccion_efectivo"]).select("id");
  if (upd.error && /resolution_note|declared_cash/i.test(upd.error.message)) {
    const { resolution_note, declared_cash, ...legacy } = full;
    upd = await supabase.from("problem_reports").update(legacy).eq("tenant_id", tenantId).eq("status", "open")
      .in("context", ["caja", "standby", "reduccion_efectivo"]).select("id");
  }
  return NextResponse.json({ success: true, adjustment: diff, resolved: upd.data?.length || 0, adminName: admin.name });
}
