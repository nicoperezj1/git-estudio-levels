import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, requireRole } from "@/lib/supabase/server";

// GET: List audit log entries
export async function GET(req: NextRequest) {
  // SEGURIDAD: el registro de acciones de TODOS los negocios es solo para el super admin.
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const action = searchParams.get("action");

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) query = query.eq("action", action);

  const { data } = await query;
  return NextResponse.json(data || []);
}

// POST: Log an action
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes cualquiera podia escribir entradas falsas con el usuario que quisiera.
  // Ahora se exige sesion y el autor sale de la sesion, no del cuerpo de la peticion.
  const guard = await requireRole(["super_admin", "admin", "receptionist", "barber"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const body = await req.json();
  const { action, entityType, entityId, description, metadata, reversible } = body;
  const userId = guard.userId;
  const { data: me } = await supabase.from("profiles").select("name").eq("id", guard.userId).maybeSingle();
  const userName = me?.name || null;

  const { data, error } = await supabase
    .from("audit_log")
    .insert({
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      description,
      metadata: metadata || {},
      user_id: userId || null,
      user_name: userName || null,
      reversible: reversible || false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: Reverse an action (super admin only, with PIN)
export async function PATCH(req: NextRequest) {
  // SEGURIDAD: solo el super admin puede marcar una accion como revertida.
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const { auditId } = await req.json();
  const reversedBy = guard.userId;

  if (!auditId) return NextResponse.json({ error: "auditId required" }, { status: 400 });

  // Mark as reversed
  const { error } = await supabase
    .from("audit_log")
    .update({
      reversed: true,
      reversed_at: new Date().toISOString(),
      reversed_by: reversedBy || null,
    })
    .eq("id", auditId)
    .eq("reversible", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
