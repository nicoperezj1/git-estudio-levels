import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";

// POST: Register a sale manually into the cash/day, gated by the admin PIN.
//
// Real-world need (Nico): the card terminal charged the client but re-booking didn't
// record the sale (the payment signal was lost). The cashier can't charge the client
// again, so they need to add the missing movement by hand so the daily count squares —
// without having to keep a parallel Excel. Requires the admin PIN so a normal
// receptionist can't invent sales freely (it's logged in the audit trail).
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { pin, barberId, serviceName, amount, paymentMethod, tip, notes } = body;

  const amountNum = parseInt(amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
  }
  if (!serviceName || !String(serviceName).trim()) {
    return NextResponse.json({ error: "Describe el servicio" }, { status: 400 });
  }

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  // Verify admin PIN belongs to an admin/super_admin of THIS business.
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "super_admin"])
    .eq("personal_pin", String(pin))
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: "PIN de administrador incorrecto" }, { status: 403 });
  }

  const method = ["cash", "debit_card", "credit_card", "transfer"].includes(paymentMethod) ? paymentMethod : "cash";
  const tipNum = parseInt(tip) || 0;

  // Create the transaction (marked in notes/audit as a manual entry so it's traceable).
  const txRow: Record<string, any> = {
    type: "income",
    status: "completed",
    subtotal: amountNum,
    discount: 0,
    total: amountNum,
    tip_amount: tipNum,
    payment_method: method,
    barber_id: barberId || null,
    tenant_id: tenantId,
    notes: notes ? `[Manual] ${notes}` : "[Manual] Registro manual de caja",
    created_by: admin.id, // quien lo registro (el administrador que puso su PIN)
    origin: "manual",
  };
  let { data: tx, error } = await supabase.from("transactions").insert(txRow).select().single();
  if (error && /origin|created_by/i.test(error.message)) {
    // Migraciones 090/097 aun no aplicadas: se guarda igual, sin esos datos.
    const { created_by: _c, origin: _o, ...legacy } = txRow;
    ({ data: tx, error } = await supabase.from("transactions").insert(legacy).select().single());
  }

  if (error || !tx) return NextResponse.json({ error: error?.message || "No se pudo registrar" }, { status: 500 });

  await supabase.from("transaction_items").insert({
    transaction_id: tx.id,
    description: serviceName,
    quantity: 1,
    unit_price: amountNum,
    total: amountNum,
  });

  await supabase.from("audit_log").insert({
    action: "manual_cash_movement",
    entity_type: "transaction",
    entity_id: tx.id,
    description: `Registro manual $${amountNum.toLocaleString("es-CL")} — ${serviceName} (${method})${tipNum ? ` +propina ${tipNum}` : ""}`,
    user_id: admin.id,
    user_name: admin.name,
    metadata: { manual: true, amount: amountNum, method, tip: tipNum, barberId },
  });

  return NextResponse.json({ success: true, transactionId: tx.id });
}
