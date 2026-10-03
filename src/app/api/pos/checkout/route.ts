import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // SEGURIDAD: antes cualquiera (sin sesion) podia registrar ventas. Ahora hace falta sesion y el
  // profesional de la venta debe ser del mismo negocio de quien cobra. Los montos NO se tocan aca.
  const { userId, role: callerRole, tenantId: callerTenant } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminSupabase();
  const body = await req.json();
  const { items, clientId, barberId, paymentMethod, payments, couponCode, discount, subtotal, total, redeemedPoints, appointmentId } = body;
  // De donde sale la venta y quien la emite (para el control de la caja): en Standby es el profesional que entro con su
  // PIN; en el Punto de Venta, la persona con la sesion abierta.
  const origin = body.origin === "standby" ? "standby" : "pos";
  // payments: optional array [{method: "cash", amount: 10000}, {method: "debit_card", amount: 7000}]
  // If not provided, falls back to single paymentMethod for full total

  // Negocio del profesional (se valida ANTES de usar cupones o crear nada).
  const { data: barberProfile } = await supabase.from("profiles").select("tenant_id").eq("id", barberId).single();
  const tenantId = barberProfile?.tenant_id || null;
  if (!barberProfile) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 400 });
  if (callerRole !== "super_admin" && tenantId !== callerTenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Validate coupon
  let couponId: string | null = null;
  if (couponCode) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", couponCode.toUpperCase())
      .single();

    if (coupon) {
      couponId = coupon.id;
      await supabase.rpc("increment_coupon_usage", { coupon_id: coupon.id });
    }
  }

  // Determine primary payment method (for the transaction record)
  const primaryMethod = payments && payments.length > 0
    ? (payments.length > 1 ? "mixed" : payments[0].method)
    : (paymentMethod || "cash");

  // Create transaction

  // Quien emite: en Standby, el profesional (si es del mismo negocio); si no, quien tiene la sesion.
  let issuedBy: string = userId;
  if (origin === "standby" && typeof body.issuedBy === "string") {
    const { data: who } = await supabase.from("profiles").select("id").eq("id", body.issuedBy).eq("tenant_id", tenantId).maybeSingle();
    if (who) issuedBy = who.id;
  }
  const txRow: Record<string, any> = {
    type: "income",
    status: "completed",
    subtotal,
    discount: discount || 0,
    total,
    payment_method: primaryMethod,
    client_id: clientId || null,
    barber_id: barberId,
    coupon_id: couponId,
    tenant_id: tenantId,
    created_by: issuedBy,
    origin,
  };
  let { data: tx, error } = await supabase.from("transactions").insert(txRow).select().single();
  if (error && /origin|created_by/i.test(error.message)) {
    // Migraciones 090/097 aun no aplicadas: se guarda la venta igual, sin esos datos.
    const { origin: _o, created_by: _c, ...legacy } = txRow;
    ({ data: tx, error } = await supabase.from("transactions").insert(legacy).select().single());
  }
  if (error || !tx) return NextResponse.json({ error: error?.message || "No se pudo registrar la venta" }, { status: 500 });

  // Log in audit
  const clientName = clientId
    ? await supabase.from("clients").select("name").eq("id", clientId).single().then((r) => r.data?.name || "")
    : "";
  const barberName = await supabase.from("profiles").select("name").eq("id", barberId).single().then((r) => r.data?.name || "");

  await supabase.from("audit_log").insert({
    action: "transaction_create",
    entity_type: "transaction",
    entity_id: tx.id,
    description: `Venta $${total.toLocaleString("es-CL")} — ${items.map((i: any) => i.name).join(", ")}${clientName ? ` — ${clientName}` : ""} (${primaryMethod})`,
    user_id: barberId,
    user_name: barberName,
    metadata: { total, subtotal, discount, paymentMethod: primaryMethod, clientId, items: items.length },
  });

  // Save split payment details
  if (payments && payments.length > 0) {
    const paymentInserts = payments.map((p: { method: string; amount: number }) => ({
      transaction_id: tx.id,
      payment_method: p.method,
      amount: p.amount,
    }));
    await supabase.from("transaction_payments").insert(paymentInserts);
  }

  // Insert items
  const itemInserts = items.map((item: any) => ({
    transaction_id: tx.id,
    service_id: item.type === "service" ? item.id : null,
    product_id: item.type === "product" ? item.id : null,
    description: item.name,
    quantity: item.quantity,
    unit_price: item.price,
    total: item.price * item.quantity,
  }));

  await supabase.from("transaction_items").insert(itemInserts);

  // Update product stock + create movements
  for (const item of items) {
    if (item.type === "product") {
      // Decrement stock
      const { data: product } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.id)
        .single();

      if (product) {
        await supabase
          .from("products")
          .update({ stock: product.stock - item.quantity })
          .eq("id", item.id);
      }

      // Movement record
      await supabase.from("inventory_movements").insert({
        product_id: item.id,
        type: "out_sale",
        quantity: item.quantity,
        barber_id: barberId,
        notes: `Venta POS - ${tx.id.slice(-8)}`,
      });
    }
  }

  // Award loyalty points if client is attached
  if (clientId && total > 0) {
    try {
      // Cada negocio tiene su propia regla de puntos: se usa la del negocio de esta venta,
      // no una cualquiera (igual que en /api/loyalty/earn).
      let configQuery = supabase.from("loyalty_config").select("points_per_clp").eq("active", true);
      if (tenantId) configQuery = configQuery.eq("tenant_id", tenantId);
      const { data: config } = await configQuery.maybeSingle();

      const pointsPerClp = config?.points_per_clp || 1000;
      const pointsEarned = Math.floor(total / pointsPerClp);

      if (pointsEarned > 0) {
        await supabase.from("loyalty_points").insert({
          client_id: clientId,
          points: pointsEarned,
          reason: "purchase",
          transaction_id: tx.id,
        });

        // Update cached balance
        const { data: client } = await supabase
          .from("clients")
          .select("loyalty_points")
          .eq("id", clientId)
          .single();

        await supabase
          .from("clients")
          .update({ loyalty_points: (client?.loyalty_points || 0) + pointsEarned })
          .eq("id", clientId);
      }
    } catch (e) {
      console.error("Error awarding loyalty points:", e);
    }
  }

  // Deduct redeemed points
  if (clientId && redeemedPoints > 0) {
    try {
      await supabase.from("loyalty_points").insert({
        client_id: clientId,
        points: -redeemedPoints,
        reason: "redemption",
        transaction_id: tx.id,
      });

      // Update cached balance
      const { data: client } = await supabase
        .from("clients")
        .select("loyalty_points")
        .eq("id", clientId)
        .single();

      await supabase
        .from("clients")
        .update({ loyalty_points: Math.max((client?.loyalty_points || 0) - redeemedPoints, 0) })
        .eq("id", clientId);
    } catch (e) {
      console.error("Error deducting loyalty points:", e);
    }
  }

  // Auto-send receipt if client has email
  if (clientId) {
    try {
      const { data: client } = await supabase
        .from("clients")
        .select("email, name")
        .eq("id", clientId)
        .single();

      if (client?.email) {
        const { sendReceipt } = await import("@/lib/resend");
        const { data: barber } = await supabase
          .from("profiles")
          .select("name, tenant_id")
          .eq("id", barberId)
          .single();

        let businessLogoUrl: string | null = null;
        let businessName: string | null = null;
        if (barber?.tenant_id) {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("logo_url, name")
            .eq("id", barber.tenant_id)
            .single();
          businessLogoUrl = tenantRow?.logo_url || null;
          businessName = tenantRow?.name || null;
        }

        await sendReceipt({
          to: client.email,
          clientName: client.name || "Cliente",
          transactionId: tx.id,
          items: items.map((item: any) => ({
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            total: item.price * item.quantity,
          })),
          subtotal,
          discount: discount || 0,
          total,
          paymentMethod: primaryMethod,
          date: new Date(),
          barberName: barber?.name || "Tu profesional",
          businessLogoUrl,
          businessName,
        });

        await supabase
          .from("transactions")
          .update({ receipt_sent: true, receipt_email: client.email })
          .eq("id", tx.id);
      }
    } catch (e) {
      // Don't fail checkout if email fails
      console.error("Error enviando boleta:", e);
    }
  }

  // Al cobrar, la cita queda COMPLETADA (asi el cliente ya cuenta como visita hecha y no hace
  // falta acordarse de marcarla a mano). Si viene desde el boton "Cobrar" del calendario se usa esa
  // cita; si se cobra directo en el POS, se completa la cita activa de HOY de ese cliente con ese
  // profesional, pero solo cuando hay exactamente una (si hubiera dos, no se adivina). Nunca
  // debe hacer fallar el cobro.
  try {
    const active = ["scheduled", "confirmed", "in_progress"];
    let apptToComplete: string | null = null;
    if (appointmentId) {
      const { data: a } = await supabase
        .from("appointments")
        .select("id, barber_id, status")
        .eq("id", appointmentId)
        .maybeSingle();
      if (a && a.barber_id === barberId && active.includes(a.status)) apptToComplete = a.id;
    } else if (clientId && barberId) {
      const { data: list } = await supabase
        .from("appointments")
        .select("id")
        .eq("client_id", clientId)
        .eq("barber_id", barberId)
        .eq("date", todayInChile())
        .in("status", active);
      if (list && list.length === 1) apptToComplete = list[0].id;
    }
    if (apptToComplete) {
      await supabase.from("appointments").update({ status: "completed" }).eq("id", apptToComplete);
    }
  } catch (e) {
    console.error("Error completando la cita al cobrar:", e);
  }

  return NextResponse.json({ success: true, transactionId: tx.id, receiptSent: !!clientId });
}
