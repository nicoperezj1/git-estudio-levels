import crypto from "crypto";

// Envio de notificaciones nativas (iPhone y Android) con Firebase Cloud Messaging (API HTTP v1).
// Se activa solo si en Vercel existe FIREBASE_SERVICE_ACCOUNT (el JSON de la cuenta de servicio de
// Firebase, completo, como texto). Sin esa clave, todo queda apagado y los avisos siguen como antes.
// La autenticacion se hace con la libreria nativa de Node (sin dependencias nuevas).

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

let cachedSA: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (cachedSA !== undefined) return cachedSA;
  cachedSA = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key && j.project_id) {
      cachedSA = { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n"), project_id: j.project_id };
    }
  } catch (e) {
    console.error("[fcm] FIREBASE_SERVICE_ACCOUNT no es un JSON valido");
  }
  return cachedSA;
}

export function fcmConfigured(): boolean {
  return !!serviceAccount();
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let tokenCache: { value: string; exp: number } | null = null;
async function accessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.value;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) {
    console.error("[fcm] no se pudo obtener el token de acceso:", res.status);
    return null;
  }
  const j = await res.json();
  tokenCache = { value: j.access_token, exp: now + Number(j.expires_in || 3600) };
  return tokenCache.value;
}

export interface FcmMessage { title: string; body?: string; url?: string }
export interface FcmResult { sent: number; failed: number; invalid: string[] }

// Envia el mismo aviso a varios telefonos. `invalid` trae los tokens que Google ya no reconoce
// (app desinstalada), para que quien llama los borre.
export async function sendFcm(tokens: string[], msg: FcmMessage): Promise<FcmResult> {
  const out: FcmResult = { sent: 0, failed: 0, invalid: [] };
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return out;
  const access = await accessToken(sa);
  if (!access) { out.failed = tokens.length; return out; }

  for (const token of tokens) {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body || "" },
            data: { url: msg.url || "/dashboard" },
            android: { priority: "HIGH" },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (res.ok) { out.sent++; continue; }
      out.failed++;
      const err = await res.json().catch(() => null);
      const status = err?.error?.status;
      if (status === "UNREGISTERED" || status === "NOT_FOUND" || res.status === 404) out.invalid.push(token);
    } catch (e) {
      out.failed++;
    }
  }
  return out;
}
