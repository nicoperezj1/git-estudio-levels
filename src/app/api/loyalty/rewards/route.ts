import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, isManagerLevel } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/lib/plan-features";

// POST: Create a reward
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion y aceptaba el negocio del cuerpo: cualquiera creaba recompensas en cualquier negocio.
  const mgr = await isManagerLevel();
  if (!mgr.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, points_required, discount_value, description } = body;

  // El negocio sale de la sesion (resolveTenantForRequest valida lo que mande el navegador).
  const { tenantId: resolved } = await resolveTenantForRequest(body.tenantId || new URL(req.url).searchParams.get("tenantId"));
  const tenantId: string | null = resolved && resolved !== "ALL" ? resolved : null;
  if (!tenantId) {
    return NextResponse.json({ error: "No se pudo determinar el negocio para la recompensa." }, { status: 400 });
  }

  // Item 34: "Sistema de fidelizacion" es feature de plan (Pro+).
  if (!(await tenantHasFeature(tenantId, "loyalty"))) {
    return NextResponse.json({ error: "El sistema de fidelizacion no esta incluido en tu plan actual. Mejora tu plan para usarlo." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .insert({
      name,
      points_required: points_required || 100,
      discount_value: discount_value || 0,
      description: description || name,
      active: true,
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: Deactivate a reward
export async function DELETE(req: NextRequest) {
  const mgr = await isManagerLevel();
  if (!mgr.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Solo recompensas de su propio negocio (super_admin con cualquiera).
  let q = supabase.from("loyalty_rewards").update({ active: false }).eq("id", id);
  if (mgr.role !== "super_admin") q = q.eq("tenant_id", mgr.tenantId as string);
  await q;
  return NextResponse.json({ success: true });
}
