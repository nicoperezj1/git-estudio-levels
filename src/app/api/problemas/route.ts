import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, isManagerLevel } from "@/lib/supabase/server";

// "Reportar problema": nota libre (ej. "faltan $10.000") que le llega al administrador. Cualquiera con
// sesion del negocio puede reportar; ver y resolver es de administracion/recepcion.
const CONTEXTS = ["standby", "caja", "reduccion_efectivo", "otro"];

export async function POST(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const note = String(body?.note || "").trim().slice(0, 1000);
  if (!note) return NextResponse.json({ error: "Escribe el problema." }, { status: 400 });
  const context = CONTEXTS.includes(body?.context) ? body.context : "standby";

  const supabase = createAdminSupabase();
  // Quien reporta: el profesional que esta en Standby (si viene) o quien tiene la sesion abierta.
  let reporterId: string = userId;
  if (body?.reportedBy && typeof body.reportedBy === "string") {
    const { data: p } = await supabase.from("profiles").select("id").eq("id", body.reportedBy).eq("tenant_id", tenantId).maybeSingle();
    if (p) reporterId = p.id;
  }
  const { data: me } = await supabase.from("profiles").select("name").eq("id", reporterId).maybeSingle();
  const base = { tenant_id: tenantId, reported_by: reporterId, reported_by_name: me?.name || null, context, note };
  const shown = Number(body?.shownCash);
  // Constancia (migracion 097): lo que mostraba la caja y el consentimiento del profesional.
  let { error } = await supabase.from("problem_reports").insert({
    ...base, shown_cash: Number.isFinite(shown) ? Math.round(shown) : null, consent: body?.consent === true,
  });
  if (error && /shown_cash|consent/i.test(error.message)) ({ error } = await supabase.from("problem_reports").insert(base)); // sin 097
  if (error) return NextResponse.json({ error: "Falta aplicar la migración 094 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  // Resumen para el aviso rojo del Standby: lo puede ver cualquiera con sesion del negocio (solo cuenta los problemas
  // de caja abiertos y muestra el mas reciente).
  if (new URL(req.url).searchParams.get("summary") === "1") {
    const { userId, tenantId: tid } = await getCurrentUserRoleAndTenant();
    if (!userId || !tid) return NextResponse.json({ open: 0, latest: null });
    const sb = createAdminSupabase();
    const { data } = await sb.from("problem_reports").select("reported_by_name, note, created_at")
      .eq("tenant_id", tid).eq("status", "open").in("context", ["caja", "standby", "reduccion_efectivo"]).order("created_at", { ascending: false }).limit(20);
    const rows = data || [];
    return NextResponse.json({ open: rows.length, latest: rows[0] || null });
  }
  const { ok, tenantId } = await isManagerLevel();
  if (!ok || !tenantId) return NextResponse.json({ reports: [] });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("problem_reports")
    .select("id, reported_by_name, context, note, created_at, shown_cash")
    .eq("tenant_id", tenantId).eq("status", "open").order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ reports: error ? [] : data || [] });
}

// Marcar como resuelto.
export async function PATCH(req: NextRequest) {
  const { ok, tenantId, userId } = await isManagerLevel();
  if (!ok || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  if (!body?.id) return NextResponse.json({ error: "Falta el reporte" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: me } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  const { data, error } = await supabase.from("problem_reports")
    .update({ status: "resolved", resolved_by_name: me?.name || null, resolved_at: new Date().toISOString() })
    .eq("id", body.id).eq("tenant_id", tenantId).eq("status", "open").select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}
