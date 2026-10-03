import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { BOOKING_RULES, getRuleConfig, type BookingRule } from "@/lib/booking-rules";
import { todayInChile } from "@/lib/utils";
import { WINDOW_OPTIONS, getWindowDays } from "@/lib/booking-window";

// Preferencias de reserva: que regla usa "Primer profesional disponible" (solo administrador).
// tenants.booking_rule + booking_rule_pros (migracion 095). Sin la migracion, queda la regla de siempre.
async function admin() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}

export async function GET() {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { data: pros } = await supabase.from("profiles").select("id, name, role, also_attends_clients")
    .eq("tenant_id", c.tenantId!).eq("active", true).in("role", ["barber", "admin"]).order("name");
  const team = (pros || []).filter((p: any) => p.role === "barber" || p.also_attends_clients).map((p: any) => ({ id: p.id, name: p.name }));
  const { error } = await supabase.from("tenants").select("booking_rule").eq("id", c.tenantId!).maybeSingle();
  const cfg = await getRuleConfig(supabase, c.tenantId!);
  const windowDays = await getWindowDays(supabase, c.tenantId!);
  return NextResponse.json({ ...cfg, windowDays, pros: team, migrationMissing: !!error && /does not exist|schema cache/i.test(error.message) });
}

export async function POST(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const rule = body?.rule as BookingRule;
  if (!BOOKING_RULES.includes(rule)) return NextResponse.json({ error: "Elige una regla." }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: pros } = await supabase.from("profiles").select("id").eq("tenant_id", c.tenantId!).in("role", ["barber", "admin"]);
  const valid = new Set((pros || []).map((p: any) => p.id));
  const priority = new Set<string>((Array.isArray(body?.priorityIds) ? body.priorityIds : []).filter((id: any) => valid.has(id)));
  const targets: Record<string, number> = {};
  let sum = 0;
  for (const [id, v] of Object.entries(body?.targets || {})) {
    if (!valid.has(id) || v === null || v === "" || v === undefined) continue;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "Cada porcentaje va entre 0 y 100." }, { status: 400 });
    targets[id] = n; sum += n;
  }
  if (rule === "target_share" && sum > 100) return NextResponse.json({ error: `Los porcentajes suman ${sum}%. El máximo es 100%.` }, { status: 400 });

  const update: Record<string, any> = { booking_rule: rule };
  if (body?.markRecoSeen === true) update.booking_reco_month = todayInChile().slice(0, 7);
  const { error } = await supabase.from("tenants").update(update).eq("id", c.tenantId!);
  if (error) {
    const missing = /does not exist|schema cache|violates check/i.test(error.message);
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 095 en la base de datos." : error.message }, { status: 500 });
  }
  // Dias que el cliente puede agendar (migracion 099). null = predeterminado.
  if (body?.windowDays !== undefined) {
    const w = body.windowDays === null ? null : Number(body.windowDays);
    if (w !== null && !WINDOW_OPTIONS.includes(w)) return NextResponse.json({ error: "Elige 7, 14, 21 o 31 días." }, { status: 400 });
    const { error: ew } = await supabase.from("tenants").update({ booking_window_days: w }).eq("id", c.tenantId!);
    if (ew) return NextResponse.json({ error: /does not exist|schema cache/i.test(ew.message) ? "Falta aplicar la migración 099 en la base de datos." : ew.message }, { status: 500 });
  }
  const rows = Array.from(valid).map((id) => ({
    tenant_id: c.tenantId, barber_id: id, is_priority: priority.has(id), target_pct: targets[id] ?? null, updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error: e2 } = await supabase.from("booking_rule_pros").upsert(rows, { onConflict: "tenant_id,barber_id" });
    if (e2) return NextResponse.json({ error: "Falta aplicar la migración 095 en la base de datos." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
