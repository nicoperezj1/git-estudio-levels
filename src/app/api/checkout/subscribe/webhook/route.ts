import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifyMpSignature } from "@/lib/mercadopago";
import { handlePreapprovalUpdate, handleAuthorizedPayment, handleOneTimePayment } from "@/lib/subscription-webhook";

// POST: unico endpoint de notificaciones de Mercado Pago para los cobros de re-booking.
// Maneja DOS mundos:
//
//  MENSUAL (suscripcion / Preapproval, cobro automatico):
//   - "subscription_preapproval" (o "preapproval"): la suscripcion cambio de estado.
//     La primera vez que pasa a "authorized" se crea el negocio.
//   - "subscription_authorized_payment" (o "authorized_payment"): se hizo UN cobro
//     mensual. Aprobado => activo; rechazado => past_due + 2 dias de gracia.
//
//  ANUAL (pago unico, Checkout Pro) — type "payment":
//   - external_reference = <signup_request id>         => primer pago: crea el negocio
//   - external_reference = "renew:<subscription id>"   => renovacion anual
//   - external_reference = "upgrade:<sub>:<plan>:<n>"  => mejora de plan (diferencia)
//
// Seguridad: se valida x-signature (MP_WEBHOOK_SECRET) y, ademas, NUNCA se confia en el
// cuerpo: siempre se vuelve a consultar el estado a la API de MP con nuestro token.
// Idempotencia: subscription_payments.mp_payment_id es unico; una notificacion repetida
// (MP reintenta cada 15 min hasta recibir 200) no vuelve a aplicar el pago.
//
// NOTE para Pablo: los nombres exactos de los eventos y campos de Preapproval deben
// verificarse contra una suscripcion real en sandbox. Por eso se loguea el payload
// crudo y se aceptan las dos variantes de nombre de evento.
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({} as any));

  const dataId: string | null = url.searchParams.get("data.id") || body?.data?.id?.toString() || null;
  const type: string = (body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "").toString();

  console.log("[subscribe/webhook] recibido:", JSON.stringify({ type, action: body?.action, dataId }));

  if (!verifyMpSignature(req, url.searchParams.get("data.id") || dataId)) {
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!accessToken || !dataId) return NextResponse.json({ received: true });

  const supabase = createAdminSupabase();

  try {
    if (type === "subscription_preapproval" || type === "preapproval") {
      await handlePreapprovalUpdate(dataId, accessToken, supabase);
    } else if (type === "subscription_authorized_payment" || type === "authorized_payment") {
      await handleAuthorizedPayment(dataId, accessToken, supabase);
    } else if (type === "payment") {
      await handleOneTimePayment(dataId, accessToken, supabase);
    }
  } catch (e: any) {
    // Se responde 200 igual: los errores se ven en logs y el pago queda pendiente de
    // revision (nunca se pierde: signup_requests sigue "pending").
    console.error("[subscribe/webhook] error procesando notificacion:", e?.message || e);
  }

  return NextResponse.json({ received: true });
}
