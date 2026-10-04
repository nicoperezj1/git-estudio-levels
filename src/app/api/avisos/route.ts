import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

// Avisos del administrador al equipo (solo admin). Cada aviso llega a la bandeja y como push de cada persona.
// POST { title, body?, audience: "all" | "barbers" | "receptionists" | "people", userIds?, requiresAck? }
// GET  -> avisos enviados, con cuántos lo leyeron y cuántos confirmaron.
async function adminOnly() {
  const c = await getCurrentUserRoleAndTenant();
  if (!c.userId || (c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}

export async function POST(req: NextRequest) {
  const c = await adminOnly();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const title = String(b.title || "").trim().slice(0, 100);
  const body = String(b.body || "").trim().slice(0, 1000);
  if (!title) return NextResponse.json({ error: "Escribe el título del aviso." }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("notification_center_enabled").eq("id", c.tenantId!).maybeSingle();
  if (tErr) return NextResponse.json({ error: "Falta aplicar la migración 100 en la base de datos." }, { status: 409 });
  if (!(tenant as any)?.notification_center_enabled) return NextResponse.json({ error: "Primero activa los avisos en Configuración." }, { status: 409 });

  let userIds: string[] | undefined;
  let roles: string[] | undefined;
  if (b.audience === "all") roles = ["admin", "barber", "receptionist"];
  else if (b.audience === "barbers") roles = ["barber"];
  else if (b.audience === "receptionists") roles = ["receptionist"];
  else if (b.audience === "people") {
    const wanted = (Array.isArray(b.userIds) ? b.userIds : []).filter((x: any) => typeof x === "string").slice(0, 200);
    if (wanted.length === 0) return NextResponse.json({ error: "Elige al menos una persona." }, { status: 400 });
    const { data: ok } = await supabase.from("profiles").select("id").eq("tenant_id", c.tenantId!).eq("active", true).in("id", wanted);
    userIds = (ok || []).map((p: any) => p.id);
  } else return NextResponse.json({ error: "Elige a quién va el aviso." }, { status: 400 });

  const { data: me } = await supabase.from("profiles").select("name").eq("id", c.userId!).maybeSingle();
  const groupId = randomUUID();
  const r = await notify({
    tenantId: c.tenantId, kind: "announcement", userIds, roles, title, body: body || undefined, url: "/dashboard/avisos",
    pushTitle: title, pushBody: body ? body.slice(0, 140) : undefined,
    requiresAck: b.requiresAck === true, groupId, createdBy: c.userId, createdByName: me?.name || null,
  });
  if (r.stored === 0) return NextResponse.json({ error: "No hay a quién enviarlo (¿todas las personas tienen sus avisos silenciados o eres la única del equipo?)." }, { status: 409 });
  return NextResponse.json({ success: true, recipients: r.stored, pushed: r.pushed });
}

export async function GET() {
  const c = await adminOnly();
  if (!c) return NextResponse.json({ sent: [] }, { status: 403 });
  const supabase = createAdminSupabase();
  const { data } = await supabase.from("notifications")
    .select("group_id, title, body, requires_ack, read_at, ack_at, created_at, user_id")
    .eq("tenant_id", c.tenantId!).eq("kind", "announcement").not("group_id", "is", null)
    .order("created_at", { ascending: false }).limit(1000);
  const groups = new Map<string, any>();
  for (const r of data || []) {
    const g = groups.get(r.group_id) || { groupId: r.group_id, title: r.title, body: r.body, requiresAck: r.requires_ack, createdAt: r.created_at, total: 0, read: 0, acked: 0 };
    g.total++; if (r.read_at) g.read++; if (r.ack_at) g.acked++;
    groups.set(r.group_id, g);
  }
  return NextResponse.json({ sent: Array.from(groups.values()).slice(0, 30) });
}
