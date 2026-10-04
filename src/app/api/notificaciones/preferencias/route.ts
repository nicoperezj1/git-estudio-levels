import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { NOTIFY_KINDS, type NotifyKind } from "@/lib/notify";

// Preferencias de la persona con la sesión abierta: tipos que silencia, horario de silencio (hora de Chile)
// y modo "sin detalles" en la pantalla bloqueada. Los avisos esenciales no se pueden silenciar.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  const { userId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data } = await createAdminSupabase().from("notification_preferences").select("muted_kinds, quiet_start, quiet_end, hide_details").eq("user_id", userId).maybeSingle();
  return NextResponse.json({
    mutedKinds: data?.muted_kinds || [], quietStart: data?.quiet_start || "", quietEnd: data?.quiet_end || "", hideDetails: !!data?.hide_details,
    kinds: Object.entries(NOTIFY_KINDS).map(([key, v]) => ({ key, label: v.label, essential: v.essential })),
  });
}

export async function PUT(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const muted = (Array.isArray(b.mutedKinds) ? b.mutedKinds : [])
    .filter((k: any) => typeof k === "string" && k in NOTIFY_KINDS && !NOTIFY_KINDS[k as NotifyKind].essential);
  const qs = typeof b.quietStart === "string" && HHMM.test(b.quietStart) ? b.quietStart : null;
  const qe = typeof b.quietEnd === "string" && HHMM.test(b.quietEnd) ? b.quietEnd : null;
  const row = { user_id: userId, tenant_id: tenantId, muted_kinds: muted, quiet_start: qs && qe ? qs : null, quiet_end: qs && qe ? qe : null, hide_details: !!b.hideDetails, updated_at: new Date().toISOString() };
  const { error } = await createAdminSupabase().from("notification_preferences").upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? "Falta aplicar la migración 100 en la base de datos." : error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
