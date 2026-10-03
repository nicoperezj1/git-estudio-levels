import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel } from "@/lib/supabase/server";

// POST: Update sort order of services
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion. Solo admin/recepcion, y solo sobre servicios de su negocio.
  const { ok, role, tenantId } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (role !== "super_admin" && !tenantId) {
    return NextResponse.json({ error: "No se pudo identificar el negocio" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => null);
  const { order } = body || {}; // array of { id, sort_order }
  if (!Array.isArray(order)) {
    return NextResponse.json({ error: "order requerido" }, { status: 400 });
  }

  for (const item of order) {
    if (!item?.id || !Number.isFinite(Number(item.sort_order))) continue;
    let q = supabase.from("services").update({ sort_order: Number(item.sort_order) }).eq("id", item.id);
    if (role !== "super_admin") q = q.eq("tenant_id", tenantId as string);
    await q;
  }

  return NextResponse.json({ success: true });
}
