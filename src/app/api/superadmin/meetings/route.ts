import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Reuniones de la plataforma. Solo super admin, y cada uno ve solo las suyas (created_by). Tolera que falte la migracion 111.
async function guard() {
  const { userId, role } = await getCurrentUserRoleAndTenant();
  if (!userId) return { res: NextResponse.json({ error: "No autorizado" }, { status: 401 }) } as const;
  if (role !== "super_admin") return { res: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const;
  return { userId } as const;
}

const MISSING = { error: "Falta aplicar la migración 111 (reuniones).", missing: true };
const isMissing = (e: any) => !!e && (e.code === "42P01" || /platform_meetings/.test(e.message || ""));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(body: any) {
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  const date = typeof body?.meeting_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.meeting_date) ? body.meeting_date : "";
  const start = typeof body?.start_time === "string" && TIME.test(body.start_time) ? body.start_time : "";
  const end = typeof body?.end_time === "string" && TIME.test(body.end_time) ? body.end_time : null;
  const link = typeof body?.link === "string" && body.link.trim() ? body.link.trim().slice(0, 500) : null;
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;
  const tenant_id = typeof body?.tenant_id === "string" && body.tenant_id ? body.tenant_id : null;
  return { title, date, start, end, link, notes, tenant_id };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if ("res" in g) return g.res;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const supabase = createAdminSupabase();
  let q = supabase.from("platform_meetings").select("*").eq("created_by", g.userId).order("meeting_date").order("start_time");
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("meeting_date", from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("meeting_date", to);
  const { data, error } = await q;
  if (error) return NextResponse.json(isMissing(error) ? MISSING : { error: "No se pudo cargar" }, { status: isMissing(error) ? 503 : 500 });
  const ids = Array.from(new Set((data || []).map((m: any) => m.tenant_id).filter(Boolean)));
  const { data: ts } = ids.length ? await supabase.from("tenants").select("id, name").in("id", ids) : { data: [] as any[] };
  const names = new Map<string, string>((ts || []).map((t: any) => [t.id, t.name]));
  return NextResponse.json((data || []).map((m: any) => ({ ...m, tenant_name: m.tenant_id ? names.get(m.tenant_id) || null : null })));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("res" in g) return g.res;
  const c = clean(await req.json().catch(() => ({})));
  if (!c.title) return NextResponse.json({ error: "Escribe un título." }, { status: 400 });
  if (!c.date || !c.start) return NextResponse.json({ error: "Elige fecha y hora." }, { status: 400 });
  if (c.end && c.end <= c.start) return NextResponse.json({ error: "La hora de término debe ser después del inicio." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("platform_meetings").insert({
    title: c.title, meeting_date: c.date, start_time: c.start, end_time: c.end, link: c.link, notes: c.notes, tenant_id: c.tenant_id, created_by: g.userId,
  }).select("*").single();
  if (error) return NextResponse.json(isMissing(error) ? MISSING : { error: "No se pudo crear la reunión." }, { status: isMissing(error) ? 503 : 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta la reunión." }, { status: 400 });
  const c = clean(body);
  if (!c.title) return NextResponse.json({ error: "Escribe un título." }, { status: 400 });
  if (!c.date || !c.start) return NextResponse.json({ error: "Elige fecha y hora." }, { status: 400 });
  if (c.end && c.end <= c.start) return NextResponse.json({ error: "La hora de término debe ser después del inicio." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("platform_meetings").update({
    title: c.title, meeting_date: c.date, start_time: c.start, end_time: c.end, link: c.link, notes: c.notes, tenant_id: c.tenant_id,
    reminded_at: null, // si cambia la hora, vuelve a avisar
  }).eq("id", id).eq("created_by", g.userId).select("*").single();
  if (error) return NextResponse.json(isMissing(error) ? MISSING : { error: "No se pudo guardar." }, { status: isMissing(error) ? 503 : 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("res" in g) return g.res;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Falta la reunión." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("platform_meetings").delete().eq("id", id).eq("created_by", g.userId);
  if (error) return NextResponse.json(isMissing(error) ? MISSING : { error: "No se pudo eliminar." }, { status: isMissing(error) ? 503 : 500 });
  return NextResponse.json({ ok: true });
}
