import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: Get terminal info for a barber (or house terminal)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");

  if (!barberId) {
    return NextResponse.json({ error: "barberId required" }, { status: 400 });
  }

  const { data: barber } = await supabase
    .from("profiles")
    .select("id, name, work_mode, mp_access_token, mp_device_id, mp_external_id, mp_store_id")
    .eq("id", barberId)
    .single();

  if (!barber) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  // If rental and has own terminal, use it
  if (barber.work_mode === "rental" && barber.mp_access_token) {
    return NextResponse.json({
      terminal: "personal",
      barberName: barber.name,
      hasTerminal: true,
      deviceId: barber.mp_device_id,
    });
  }

  // Otherwise use house terminal (env vars)
  const houseToken = process.env.MP_ACCESS_TOKEN;
  return NextResponse.json({
    terminal: "house",
    barberName: barber.name,
    hasTerminal: !!houseToken,
    deviceId: process.env.MP_DEVICE_ID || null,
  });
}

// POST: Create payment intent on the barber's terminal
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { barberId, amount, description, externalReference, cartType } = body;
  // cartType: "services" | "products" | "mixed" — determines which terminal to use

  // Determine which token to use
  const { data: barber } = await supabase
    .from("profiles")
    .select("id, name, work_mode, mp_access_token, mp_device_id, mp_store_id, tenant_id")
    .eq("id", barberId)
    .single();

  if (!barber) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  // A MercadoPago device_id can ONLY be charged with the access_token of the SAME
  // MP account it's registered in. So device_id and access_token MUST always come from
  // the same source — never mix a device from one source with a token from another,
  // or the terminal wakes up but the charge is rejected ("pago rechazado").
  //
  // Resolution order (each source provides BOTH device + the token to use with it):
  //   1. Barber's personal (rental) terminal
  //   2. Tenant multi-terminal matching the cart type (mp_terminals)
  //   3. Tenant multi-terminal "all" type
  //   4. Any active tenant multi-terminal
  //   5. Legacy tenant_settings single device
  //   6. Env vars (backwards compatibility)
  // For mp_terminals rows without their own access_token, we pair the device with the
  // tenant's global token (they belong to the same MP account by definition).
  let finalToken: string | null = null;
  let finalDeviceId: string | null = null;
  const tenantId = barber.tenant_id;

  // Tenant global token (used to back terminals that don't carry their own token)
  let tenantGlobalToken: string | null = null;
  if (tenantId) {
    const { data: tenantSettings } = await supabase
      .from("tenant_settings")
      .select("mp_access_token")
      .eq("tenant_id", tenantId)
      .single();
    tenantGlobalToken = tenantSettings?.mp_access_token || null;
  }

  // 1. Barber's personal terminal (device + token from the barber row)
  if (barber.work_mode === "rental" && barber.mp_access_token && barber.mp_device_id) {
    finalToken = barber.mp_access_token;
    finalDeviceId = barber.mp_device_id;
  }

  // Helper: pick a terminal row and pair its device with the correct token
  const useTerminal = (t: { device_id: string | null; access_token: string | null } | null) => {
    if (!t?.device_id) return false;
    finalDeviceId = t.device_id;
    // Use the terminal's own token if present, otherwise the tenant global token.
    finalToken = t.access_token || tenantGlobalToken;
    return !!finalToken;
  };

  if (!finalDeviceId && tenantId) {
    const terminalType = cartType === "products" ? "products" : cartType === "services" ? "services" : null;

    // 2. Terminal matching the cart type
    if (terminalType) {
      const { data: typedTerminal } = await supabase
        .from("mp_terminals")
        .select("device_id, access_token")
        .eq("tenant_id", tenantId)
        .eq("terminal_type", terminalType)
        .eq("active", true)
        .limit(1)
        .single();
      useTerminal(typedTerminal);
    }

    // 3. "all" type terminal
    if (!finalDeviceId) {
      const { data: allTerminal } = await supabase
        .from("mp_terminals")
        .select("device_id, access_token")
        .eq("tenant_id", tenantId)
        .eq("terminal_type", "all")
        .eq("active", true)
        .limit(1)
        .single();
      useTerminal(allTerminal);
    }

    // 4. Any active terminal
    if (!finalDeviceId) {
      const { data: anyTerminal } = await supabase
        .from("mp_terminals")
        .select("device_id, access_token")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .limit(1)
        .single();
      useTerminal(anyTerminal);
    }

    // 5. Legacy tenant_settings single device (device + global token, same account)
    if (!finalDeviceId) {
      const { data: legacy } = await supabase
        .from("tenant_settings")
        .select("mp_access_token, mp_device_id")
        .eq("tenant_id", tenantId)
        .single();
      if (legacy?.mp_device_id) {
        finalDeviceId = legacy.mp_device_id;
        finalToken = legacy.mp_access_token || tenantGlobalToken;
      }
    }
  }

  // 6. Env vars (both from the same env account)
  if (!finalDeviceId && process.env.MP_DEVICE_ID) {
    finalDeviceId = process.env.MP_DEVICE_ID;
    finalToken = process.env.MP_ACCESS_TOKEN || null;
  }

  if (!finalToken) {
    return NextResponse.json({ error: "Token de MercadoPago no configurado. Ve a Configuracion → MercadoPago." }, { status: 400 });
  }

  if (!finalDeviceId) {
    return NextResponse.json({ error: "Dispositivo MP no configurado. Ve a Configuracion → MercadoPago." }, { status: 400 });
  }

  try {
    // Cancel any pending orders for THIS device first (avoid "already queued" error).
    // Scoped to this device_id so we never touch other terminals'/tenants' pending
    // orders (which were created with a different account's token).
    const { data: pendingOrders } = await supabase
      .from("mp_payment_intents")
      .select("mp_payment_id")
      .eq("status", "pending")
      .eq("device_id", finalDeviceId)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const order of pendingOrders || []) {
      if (!order.mp_payment_id) continue;
      try {
        await fetch(`https://api.mercadopago.com/v1/orders/${order.mp_payment_id}/cancel`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${finalToken}`, "Content-Type": "application/json" },
        });
      } catch {} // Ignore cancel errors (order might already be expired/cancelled)
      await supabase.from("mp_payment_intents").update({ status: "cancelled" }).eq("mp_payment_id", order.mp_payment_id);
    }

    // Chile uses Orders API (not Point Integration API)
    const idempotencyKey = `${externalReference || "pos"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ordersRes = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${finalToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        type: "point",
        external_reference: externalReference || `pos-${Date.now()}`,
        transactions: {
          payments: [{
            amount: String(Number(amount)),
          }],
        },
        config: {
          point: {
            terminal_id: finalDeviceId,
          },
        },
        description: description || "Venta re-booking",
      }),
    });

    const ordersData = await ordersRes.json();

    if (!ordersRes.ok) {
      // If "already queued", wait and retry once
      const errorMsg = ordersData.errors?.[0]?.message || ordersData.error || "";
      if (errorMsg.includes("already") && errorMsg.includes("queued")) {
        // Wait 2s for the terminal to clear
        await new Promise((r) => setTimeout(r, 2000));
        const retryRes = await fetch("https://api.mercadopago.com/v1/orders", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${finalToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `${idempotencyKey}-retry`,
          },
          body: JSON.stringify({
            type: "point",
            external_reference: externalReference || `pos-${Date.now()}`,
            transactions: { payments: [{ amount: String(Number(amount)) }] },
            config: { point: { terminal_id: finalDeviceId } },
            description: description || "Venta re-booking",
          }),
        });
        const retryData = await retryRes.json();
        if (retryRes.ok) {
          await supabase.from("mp_payment_intents").insert({
            barber_id: barberId, amount, status: "pending",
            mp_payment_id: retryData.id, mp_external_reference: externalReference, device_id: finalDeviceId,
          });
          // Process
          await fetch(`https://api.mercadopago.com/v1/orders/${retryData.id}/process`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${finalToken}`, "Content-Type": "application/json" },
          });
          return NextResponse.json({ success: true, paymentIntentId: retryData.id, deviceId: finalDeviceId, barberName: barber.name, terminal: "house" });
        }
      }

      return NextResponse.json({
        error: ordersData.errors?.[0]?.message || "Error al crear orden de pago",
        details: ordersData,
      }, { status: ordersRes.status });
    }

    // Process the order (sends it to the terminal)
    const processRes = await fetch(`https://api.mercadopago.com/v1/orders/${ordersData.id}/process`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${finalToken}`,
        "Content-Type": "application/json",
      },
    });

    // Store payment intent
    await supabase.from("mp_payment_intents").insert({
      barber_id: barberId,
      amount,
      status: "pending",
      mp_payment_id: ordersData.id,
      mp_external_reference: externalReference,
      device_id: finalDeviceId,
    });

    return NextResponse.json({
      success: true,
      paymentIntentId: ordersData.id,
      deviceId: finalDeviceId,
      barberName: barber.name,
      terminal: barber.work_mode === "rental" && barber.mp_access_token ? "personal" : "house",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
