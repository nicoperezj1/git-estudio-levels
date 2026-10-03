import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// PATCH: Registra la propina de una venta (tarjeta: la agrega el cliente en la maquina; efectivo: la deja en mano).
// Es informativa: no cobra nada. La propina va 100% al profesional que atendio y entra a su libro de movimientos.
// SEGURIDAD: antes no pedia sesion y cambiaba la propina de cualquier venta por id. Ahora exige sesion y que
// la venta sea del negocio de quien llama (salvo super_admin).
export async function PATCH(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  if (!caller.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminSupabase();
  const { transactionId, tipAmount } = await req.json().catch(() => ({} as any));

  if (!transactionId || tipAmount === undefined) {
    return NextResponse.json({ error: "transactionId y tipAmount son obligatorios" }, { status: 400 });
  }
  const tip = Math.max(0, Math.round(Number(tipAmount) || 0));
  if (tip > 1_000_000) return NextResponse.json({ error: "Monto de propina no valido" }, { status: 400 });

  const { data: tx } = await supabase.from("transactions").select("tenant_id, type").eq("id", transactionId).maybeSingle();
  if (!tx || tx.type !== "income" || (caller.role !== "super_admin" && tx.tenant_id !== caller.tenantId)) {
    return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  }

  const { error } = await supabase.from("transactions").update({ tip_amount: tip }).eq("id", transactionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
