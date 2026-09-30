import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// TUU (Haulmer) "Pago Remoto" — same role as /api/mercadopago but for the TUU
// terminal. Kept as a fully separate endpoint so MercadoPago tenants are never
// touched; a tenant only reaches this code path if it explicitly set
// tenant_settings.card_payment_provider = 'tuu' (see /api/settings/tuu).
//
// Docs: https://developers.tuu.cl/docs/pago-remoto
// Unlike MercadoPago (token per MP account, tied 1:1 to a device), TUU uses a single
// API Key per comercio (Espacio de Trabajo) that can drive multiple physical devices,
// identified by their serial number ("device" field / "SN:" on the machine label).

const TUU_BASE_URL = "https://integrations.payment.haulmer.com";

// POST: Create a remote payment request on a TUU terminal
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { barberId, amount, description, cartType, cardMethod } = body;
  // cardMethod: "debit_card" | "credit_card" — TUU requires this explicitly
  // (paymentMethod: 1 = credito, 2 = debito), unlike MercadoPago which doesn't need it
  // at charge time.

  if (!barberId || !amount) {
    return NextResponse.json({ error: "barberId y amount son obligatorios" }, { status: 400 });
  }

  const { data: barber } = await supabase
    .from("profiles")
    .select("id, name, tenant_id")
    .eq("id", barberId)
    .single();

  if (!barber) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  const tenantId = barber.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("tuu_api_key")
    .eq("tenant_id", tenantId)
    .single();

  const apiKey = settings?.tuu_api_key || process.env.TUU_API_KEY || null;
  if (!apiKey) {
    return NextResponse.json({ error: "API Key de TUU no configurada. Ve a Configuracion -> TUU." }, { status: 400 });
  }

  // Pick a device serial: terminal matching cart type -> "all" -> any active.
  let deviceSerial: string | null = null;
  const terminalType = cartType === "products" ? "products" : cartType === "services" ? "services" : null;

  if (terminalType) {
    const { data: typed } = await supabase
      .from("tuu_terminals")
      .select("device_serial")
      .eq("tenant_id", tenantId)
      .eq("terminal_type", terminalType)
      .eq("active", true)
      .limit(1)
      .single();
    deviceSerial = typed?.device_serial || null;
  }

  if (!deviceSerial) {
    const { data: allType } = await supabase
      .from("tuu_terminals")
      .select("device_serial")
      .eq("tenant_id", tenantId)
      .eq("terminal_type", "all")
      .eq("active", true)
      .limit(1)
      .single();
    deviceSerial = allType?.device_serial || null;
  }

  if (!deviceSerial) {
    const { data: any } = await supabase
      .from("tuu_terminals")
      .select("device_serial")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .limit(1)
      .single();
    deviceSerial = any?.device_serial || null;
  }

  if (!deviceSerial) {
    return NextResponse.json({ error: "Terminal TUU no configurado. Ve a Configuracion -> TUU." }, { status: 400 });
  }

  // paymentMethod is required by TUU (1 = credito, 2 = debito). Default to debito if
  // not provided (shouldn't happen — the POS always knows which button was pressed).
  const paymentMethod = cardMethod === "credit_card" ? 1 : 2;

  // dteType: services in this app are sold as boleta exenta (99), products as
  // afecta/comprobante afecto (0, TUU's default) — mirrors the existing
  // "SERVICIOS exento IVA" / "PRODUCTOS afecto IVA" distinction already used for
  // MercadoPago terminals in Configuracion.
  const dteType = cartType === "services" ? 99 : 0;

  const idempotencyKey = crypto.randomUUID();

  try {
    const res = await fetch(`${TUU_BASE_URL}/RemotePayment/v2/Create`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey,
        amount: Math.round(Number(amount)),
        device: deviceSerial,
        paymentMethod,
        dteType,
        description: (description || "Venta re-booking").slice(0, 28),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({
        error: data.message || data.error || "Error al crear solicitud de pago en TUU",
        details: data,
      }, { status: res.status });
    }

    await supabase.from("tuu_payment_intents").insert({
      barber_id: barberId,
      tenant_id: tenantId,
      amount: Math.round(Number(amount)),
      status: "pending",
      idempotency_key: idempotencyKey,
      device_serial: deviceSerial,
    });

    return NextResponse.json({
      success: true,
      paymentIntentId: idempotencyKey,
      deviceId: deviceSerial,
      barberName: barber.name,
      terminal: "tuu",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
