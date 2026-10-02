import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, requireTenantRole, requireRole } from "@/lib/supabase/server";

// CRUD for TUU terminals (device serial numbers). Mirrors
// /api/settings/mercadopago/terminals exactly, but for tuu_terminals.

// GET: List terminals for a tenant
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  if (!tenantId || tenantId === "ALL") return NextResponse.json([]);

  const { data } = await supabase
    .from("tuu_terminals")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("created_at");

  return NextResponse.json(data || []);
}

// POST: Add a terminal
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, device_serial, terminal_type } = body;
  // SEGURIDAD: antes no pedia sesion y confiaba en el tenantId del cuerpo: cualquiera podia
  // cambiar las credenciales de cobro de cualquier negocio. Solo admin, solo de su negocio.
  const guard = await requireTenantRole(["admin", "super_admin"], body.tenantId);
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  if (!name || !device_serial) {
    return NextResponse.json({ error: "name y device_serial son obligatorios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tuu_terminals")
    .insert({
      tenant_id: tenantId,
      name,
      device_serial,
      terminal_type: terminal_type || "all",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: Update a terminal
export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { id, name, device_serial, terminal_type, active } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // SEGURIDAD: la terminal debe pertenecer al negocio de quien edita.
  const guard = await requireRole(["admin", "super_admin"]);
  if (!guard.ok) return guard.response;
  const { data: owned } = await supabase.from("tuu_terminals").select("tenant_id").eq("id", id).maybeSingle();
  if (!owned || (guard.role !== "super_admin" && owned.tenant_id !== guard.tenantId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const update: any = {};
  if (name !== undefined) update.name = name;
  if (device_serial !== undefined) update.device_serial = device_serial;
  if (terminal_type !== undefined) update.terminal_type = terminal_type;
  if (active !== undefined) update.active = active;

  const { data, error } = await supabase
    .from("tuu_terminals")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: Remove a terminal (soft delete)
export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // SEGURIDAD: solo un admin, y solo de una terminal de su propio negocio.
  const guard = await requireRole(["admin", "super_admin"]);
  if (!guard.ok) return guard.response;
  const { data: owned } = await supabase.from("tuu_terminals").select("tenant_id").eq("id", id).maybeSingle();
  if (!owned || (guard.role !== "super_admin" && owned.tenant_id !== guard.tenantId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await supabase.from("tuu_terminals").update({ active: false }).eq("id", id);
  return NextResponse.json({ success: true });
}
