import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole, requireRole } from "@/lib/supabase/server";

// GET: List terminals for a tenant
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") return NextResponse.json([]);

  const { data } = await supabase
    .from("mp_terminals")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("created_at");

  // El token de cada terminal nunca sale del servidor: solo se indica si tiene uno.
  return NextResponse.json(
    (data || []).map(({ access_token, ...t }: any) => ({ ...t, has_token: !!access_token }))
  );
}

// POST: Add a terminal
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, device_id, terminal_type, access_token } = body;
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // cambiar las credenciales de cobro de cualquier negocio. Solo admin, solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  if (!name || !device_id) {
    return NextResponse.json({ error: "name y device_id son obligatorios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mp_terminals")
    .insert({
      tenant_id: tenantId,
      name,
      device_id,
      terminal_type: terminal_type || "all",
      access_token: access_token || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { access_token: _t, ...safe } = (data || {}) as any;
  return NextResponse.json({ ...safe, has_token: !!_t });
}

// PATCH: Update a terminal
export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { id, name, device_id, terminal_type, access_token, active } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // SEGURIDAD: la terminal debe pertenecer al negocio de quien edita.
  const guard = await requireRole(["admin", "super_admin"]);
  if (!guard.ok) return guard.response;
  const { data: owned } = await supabase.from("mp_terminals").select("tenant_id").eq("id", id).maybeSingle();
  if (!owned || (guard.role !== "super_admin" && owned.tenant_id !== guard.tenantId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const update: any = {};
  if (name !== undefined) update.name = name;
  if (device_id !== undefined) update.device_id = device_id;
  if (terminal_type !== undefined) update.terminal_type = terminal_type;
  if (access_token !== undefined) update.access_token = access_token || null;
  if (active !== undefined) update.active = active;

  const { data, error } = await supabase
    .from("mp_terminals")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { access_token: _tk, ...safePatched } = (data || {}) as any;
  return NextResponse.json({ ...safePatched, has_token: !!_tk });
}

// DELETE: Remove a terminal
export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // SEGURIDAD: solo un admin, y solo de una terminal de su propio negocio.
  const guard = await requireRole(["admin", "super_admin"]);
  if (!guard.ok) return guard.response;
  const { data: owned } = await supabase.from("mp_terminals").select("tenant_id").eq("id", id).maybeSingle();
  if (!owned || (guard.role !== "super_admin" && owned.tenant_id !== guard.tenantId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await supabase.from("mp_terminals").update({ active: false }).eq("id", id);
  return NextResponse.json({ success: true });
}
