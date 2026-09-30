import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// SEGURIDAD: una nota solo se puede ver/crear/editar/borrar si el cliente pertenece al
// negocio del usuario logueado (el super_admin puede con cualquiera).
async function authorizeClient(supabase: ReturnType<typeof createAdminSupabase>, clientId: string) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return { ok: false as const, status: 401, userId: null };
  if (role === "super_admin") return { ok: true as const, status: 200, userId };
  const { data: client } = await supabase.from("clients").select("tenant_id").eq("id", clientId).single();
  if (!client || (client.tenant_id && client.tenant_id !== tenantId)) return { ok: false as const, status: 403, userId };
  return { ok: true as const, status: 200, userId };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json([], { status: auth.status });

  const { data } = await supabase
    .from("client_notes")
    .select("*, created_by_profile:profiles!client_notes_created_by_fkey(name)")
    .eq("client_id", params.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: auth.status });

  const { note, pinned } = await req.json();
  if (!note?.trim()) {
    return NextResponse.json({ error: "Nota requerida" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_notes")
    .insert({
      client_id: params.id,
      note: note.trim(),
      pinned: !!pinned,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// Editar el texto y/o fijar/desfijar una nota.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: auth.status });

  const { noteId, note, pinned } = await req.json();
  if (!noteId) return NextResponse.json({ error: "noteId requerido" }, { status: 400 });

  const update: Record<string, any> = {};
  if (typeof note === "string") {
    if (!note.trim()) return NextResponse.json({ error: "La nota no puede quedar vacía" }, { status: 400 });
    update.note = note.trim();
  }
  if (typeof pinned === "boolean") update.pinned = pinned;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_notes")
    .update(update)
    .eq("id", noteId)
    .eq("client_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: auth.status });

  const noteId = new URL(req.url).searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId requerido" }, { status: 400 });

  const { error } = await supabase.from("client_notes").delete().eq("id", noteId).eq("client_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
