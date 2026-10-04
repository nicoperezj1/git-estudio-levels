import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Bandeja de la persona con la sesión abierta. Solo ve y toca SUS avisos.
// GET  ?count=1  -> solo { enabled, unread }   |   GET -> { enabled, unread, items }
// POST { action: "read", ids?: string[], all?: boolean }  |  { action: "ack", id }

async function centerEnabled(supabase: ReturnType<typeof createAdminSupabase>, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false;
  const { data, error } = await supabase.from("tenants").select("notification_center_enabled").eq("id", tenantId).maybeSingle();
  return !error && !!(data as any)?.notification_center_enabled;
}

export async function GET(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ enabled: false, unread: 0, items: [] }, { status: 401 });
  const supabase = createAdminSupabase();
  const enabled = await centerEnabled(supabase, tenantId);
  if (!enabled) return NextResponse.json({ enabled: false, unread: 0, items: [] });

  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  if (new URL(req.url).searchParams.get("count")) return NextResponse.json({ enabled: true, unread: count || 0 });

  const { data } = await supabase.from("notifications")
    .select("id, kind, title, body, url, requires_ack, read_at, ack_at, created_by_name, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
  return NextResponse.json({ enabled: true, unread: count || 0, items: data || [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  if (body?.action === "read") {
    let q = supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
    if (!body.all) {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === "string").slice(0, 100) : [];
      if (ids.length === 0) return NextResponse.json({ error: "Nada que marcar" }, { status: 400 });
      q = q.in("id", ids);
    }
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body?.action === "ack") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const { error } = await supabase.from("notifications").update({ ack_at: now, read_at: now }).eq("id", body.id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
