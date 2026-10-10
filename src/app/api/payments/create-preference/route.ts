import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { appointmentId, services, clientName, clientEmail, totalPrice } = body;

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MercadoPago no configurado" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";

  const items = services.map((s: { name: string; price: number }) => ({
    title: s.name,
    quantity: 1,
    unit_price: s.price,
    currency_id: "CLP",
  }));

  // Create preference via MercadoPago API
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      items,
      payer: {
        name: clientName,
        email: clientEmail || "cliente@rebooking.cl",
      },
      back_urls: {
        success: `${appUrl}/booking/payment-result?status=success&appointment=${appointmentId}`,
        failure: `${appUrl}/booking/payment-result?status=failure&appointment=${appointmentId}`,
        pending: `${appUrl}/booking/payment-result?status=pending&appointment=${appointmentId}`,
      },
      auto_return: "approved",
      external_reference: appointmentId,
      notification_url: `${appUrl}/api/payments/webhook`,
      statement_descriptor: "REBOOKING",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("MercadoPago error:", data);
    return NextResponse.json({ error: "Error creando preferencia de pago" }, { status: 500 });
  }

  return NextResponse.json({
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
  });
}
