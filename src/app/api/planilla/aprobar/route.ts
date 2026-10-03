import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

// Aprobar un descuento por planilla con su CODIGO (recepcion o administrador). Recien aqui se
// descuenta el stock y se anota en el libro del profesional (tipo "Descuento por planilla").
// Si el descuento supera el 15% (trabajadores con contrato), hace falta confirmarlo (`confirmOver`).
export async function POST(req: NextRequest) {
  const { ok, tenantId, userId } = await isManagerLevel();
  if (!ok || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const code = String(body?.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return NextResponse.json({ error: "El código tiene 6 caracteres." }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: d } = await supabase.from("payroll_discounts").select("*")
    .eq("tenant_id", tenantId).eq("code", code).eq("status", "pending").maybeSingle();
  if (!d) return NextResponse.json({ error: "Código no encontrado o ya usado." }, { status: 404 });

  if (d.over_limit && body?.confirmOver !== true) {
    return NextResponse.json({
      needsConfirm: true,
      message: `Este descuento supera el 15% de lo que lleva ganado ${d.barber_name} este mes. Por ley el descuento por planilla no puede pasar de ese tope. ¿Confirmas igual?`,
      total: Number(d.total), barberName: d.barber_name, productName: d.product_name, quantity: d.quantity,
    }, { status: 409 });
  }

  const { data: prod } = await supabase.from("products").select("id, stock").eq("id", d.product_id).eq("tenant_id", tenantId).maybeSingle();
  if (!prod || Number(prod.stock) < d.quantity) {
    return NextResponse.json({ error: "Ya no hay stock suficiente de ese producto." }, { status: 409 });
  }

  // Marcar aprobado primero (solo si seguia pendiente): evita que dos personas apliquen el mismo codigo.
  const { data: me } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  const { data: claimed } = await supabase.from("payroll_discounts")
    .update({ status: "approved", approved_by_name: me?.name || null, approved_at: new Date().toISOString() })
    .eq("id", d.id).eq("status", "pending").select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ error: "Código no encontrado o ya usado." }, { status: 409 });

  await supabase.from("products").update({ stock: Number(prod.stock) - d.quantity }).eq("id", prod.id);
  // Movimiento de inventario (salida por uso). Se revisa el resultado: antes un fallo aqui pasaba sin avisar.
  const movement = {
    product_id: prod.id, type: "out_use", quantity: d.quantity, barber_id: d.barber_id, tenant_id: tenantId, status: "approved",
    notes: `Descuento por planilla - ${d.barber_name} (${code})`,
  };
  let movErr = (await supabase.from("inventory_movements").insert(movement)).error;
  if (movErr) {
    console.error("planilla: no se pudo registrar el movimiento de inventario:", movErr.message);
    // Reintento sin las columnas opcionales por si alguna no existe en esta base.
    const { barber_id, status, ...basic } = movement as any;
    movErr = (await supabase.from("inventory_movements").insert(basic)).error;
    if (movErr) console.error("planilla: reintento del movimiento tambien fallo:", movErr.message);
  }
  const month = `${todayInChile().slice(0, 7)}-01`;
  const { error: ledgerErr } = await supabase.from("professional_ledger").insert({
    tenant_id: tenantId, barber_id: d.barber_id, month, kind: "payroll_discount", amount: Number(d.total), effect: -1,
    reason: `Planilla: ${d.product_name} x${d.quantity} (código ${code})`,
    created_by: userId, created_by_name: me?.name || null,
  });
  if (ledgerErr) console.error("planilla: no se pudo anotar en el libro del profesional:", ledgerErr.message);
  return NextResponse.json({ success: true, total: Number(d.total), ledgerSaved: !ledgerErr, movementSaved: !movErr, movementError: movErr?.message || null, ledgerError: ledgerErr?.message || null });
}
