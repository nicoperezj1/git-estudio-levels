import crypto from "crypto";
import type { NextRequest } from "next/server";

// Helpers compartidos para hablar con Mercado Pago (cuenta de re-booking, no la de
// cada negocio): preferencias de pago unico (plan anual) y validacion de webhooks.

export const MP_API = "https://api.mercadopago.com";

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";
}

// Mercado Pago exige URLs https para back_url y notification_url. En desarrollo local
// (http://localhost) usamos MP_PUBLIC_URL (p. ej. un tunel https) o, si no esta, el
// dominio publico. Asi se puede llegar a la pantalla de pago de MP; el webhook solo
// llegara si MP_PUBLIC_URL apunta a un tunel hacia este servidor.
export function getMpPublicUrl() {
  const explicit = process.env.MP_PUBLIC_URL;
  if (explicit && explicit.startsWith("https://")) return explicit.replace(/\/$/, "");
  const app = getAppUrl();
  if (app.startsWith("https://")) return app.replace(/\/$/, "");
  return "https://www.re-booking.cl";
}

// Valida el header x-signature de una notificacion de Mercado Pago:
//   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"  -> HMAC-SHA256 con
//   MP_WEBHOOK_SECRET ("Tus integraciones > Webhooks" en el panel de MP), comparado
//   contra el v1 del header. Sin MP_WEBHOOK_SECRET configurado no se valida (dev),
//   pero igual nunca confiamos en el cuerpo: el webhook siempre vuelve a consultar el
//   estado real a la API de MP con nuestro token.
export function verifyMpSignature(req: NextRequest, dataId: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[mercadopago] MP_WEBHOOK_SECRET no configurado: webhook sin validar firma");
    return true;
  }

  const signature = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  if (!signature || !dataId) return false;

  let ts = "";
  let v1 = "";
  for (const part of signature.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function mpGet(path: string, accessToken: string) {
  const res = await fetch(`${MP_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json().catch(() => null);
}

interface PreferenceInput {
  accessToken: string;
  title: string;
  amount: number;
  payerEmail?: string | null;
  externalReference: string;
  backUrl: string; // se le agrega result=success|pending|failure (MP ya agrega su propio `status`)
}

// Pago unico por Checkout Pro (plan anual, renovaciones anuales y mejoras de plan).
export async function createCheckoutPreference(input: PreferenceInput) {
  const appUrl = getMpPublicUrl();
  const sep = input.backUrl.includes("?") ? "&" : "?";
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({
      items: [
        {
          title: input.title,
          quantity: 1,
          unit_price: input.amount,
          currency_id: "CLP",
        },
      ],
      payer: input.payerEmail ? { email: input.payerEmail } : undefined,
      external_reference: input.externalReference,
      back_urls: {
        success: `${input.backUrl}${sep}result=success`,
        pending: `${input.backUrl}${sep}result=pending`,
        failure: `${input.backUrl}${sep}result=failure`,
      },
      auto_return: "approved",
      notification_url: `${appUrl}/api/checkout/subscribe/webhook`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("MercadoPago error (checkout/preferences):", data);
    return { ok: false as const, error: data };
  }
  return { ok: true as const, id: data.id as string, initPoint: data.init_point as string };
}
