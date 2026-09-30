import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// SEGURIDAD (Nico, 25-sep): estas rutas operan sobre CUALQUIER empresa de la plataforma
// (editar datos, ver contacto del dueño, eliminar TODO su historial) — solo super_admin.
async function requireSuperAdmin() {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

// GET: detalle de una empresa, incluyendo datos de contacto del dueño (Punto de Pablo,
// 25-sep: "ver contacto del dueño" desde Superadmin).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const supabase = createAdminSupabase();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(`*, subscription:subscriptions(plan, status, current_period_end)`)
    .eq("id", params.id)
    .single();

  if (error || !tenant) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  // Conteos rapidos para que el panel de "eliminar" muestre el tamano real del borrado
  // (cuantos clientes/citas/transacciones se perderian) antes de confirmar.
  const [{ count: clients }, { count: appointments }, { count: transactions }, { count: profiles }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", params.id),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("tenant_id", params.id),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("tenant_id", params.id),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", params.id),
  ]);

  return NextResponse.json({
    ...tenant,
    counts: {
      clients: clients || 0,
      appointments: appointments || 0,
      transactions: transactions || 0,
      profiles: profiles || 0,
    },
  });
}

const EDITABLE_FIELDS = [
  "name", "rut_empresa", "admin_email", "admin_name", "phone", "address", "city",
  "plan", "status", "logo_url", "website", "social_media", "max_professionals",
  "max_branches", "active",
  // Cupos de mensajeria (Nico, 27-sep): override por negocio, mismo patron que
  // max_professionals — vacio/null usa el default del plan (ver migracion 073).
  "whatsapp_quota_override", "email_quota_override",
  // Rubro del negocio y carga de documentos en la ficha de cliente (Nico, 28-sep,
  // migracion 078).
  "business_category", "client_files_enabled",
] as const;

// PATCH: editar datos de una empresa (Punto de Pablo, 25-sep). El slug NO es editable
// aca a proposito: se usa en los links publicos de reserva ya compartidos
// (re-booking.cl/<slug>/...), cambiarlo silenciosamente rompe los links que el negocio
// ya haya repartido.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({} as any));
  const updates: Record<string, any> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] === "" ? null : body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: borra la empresa y TODO su historial (clientes, citas, transacciones, caja,
// etc.) de forma permanente via la funcion delete_tenant_cascade (migracion 071 —
// pendiente de correr en produccion, ver bloqueo de acceso a Supabase). Pensada
// unicamente para limpiar empresas ficticias/de prueba antes de sumar salones reales,
// nunca para un negocio con datos reales (no hay papelera ni forma de deshacerlo).
//
// Doble seguro: ademas de la confirmacion que ya exige el frontend (escribir el nombre
// exacto de la empresa), esta ruta vuelve a pedir ese mismo nombre en el body y lo
// compara contra el de la base — asi un DELETE armado a mano (o un bug en el frontend)
// no puede borrar la empresa equivocada.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({} as any));
  const confirmName = (body.confirmName || "").trim();

  const supabase = createAdminSupabase();
  const { data: tenant, error: fetchError } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (fetchError || !tenant) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  if (confirmName !== tenant.name) {
    return NextResponse.json({ error: "El nombre no coincide. Escribelo exactamente igual para confirmar." }, { status: 400 });
  }

  // Los usuarios de auth (login) del tenant hay que borrarlos aparte via la Admin API —
  // no son filas de una tabla de este esquema, asi que delete_tenant_cascade no los toca.
  // Se buscan ANTES del cascade (una vez borrados los profiles ya no se pueden listar).
  const { data: tenantProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", params.id);

  const { error: cascadeError } = await supabase.rpc("delete_tenant_cascade", { p_tenant_id: params.id });

  if (cascadeError) {
    // Un error aca significa que la funcion (o alguna tabla que referencia al tenant sin
    // cascade) todavía no existe en produccion, o que algo quedo fuera de la migracion
    // 071 — gracias a que todo corre dentro de una sola funcion, Postgres hizo rollback
    // completo: no se borro nada a medias.
    return NextResponse.json({
      error: `No se pudo eliminar: ${cascadeError.message}. No se borro ningun dato (rollback automatico).`,
    }, { status: 500 });
  }

  // Borrado de los usuarios de auth — best effort: la empresa y sus datos YA se
  // eliminaron con exito, asi que un fallo aca no revierte eso, solo queda una cuenta de
  // login huerfana que se puede limpiar despues a mano.
  for (const p of tenantProfiles || []) {
    await supabase.auth.admin.deleteUser(p.id).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
