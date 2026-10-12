"use client";

// Avisos nativos (iPhone y Android) dentro de la app movil. El plugin nativo
// (@capacitor-firebase/messaging) lo registra la app; desde la web se alcanza por el puente de Capacitor.
// En la web normal no existe y todo devuelve "no disponible". La preferencia es POR PERSONA y por telefono:
// se guarda con el id de quien la activo, para que otra persona en el mismo telefono no reciba sus avisos.

const FLAG = "rb_native_push_user";   // id de la persona que activo los avisos en este telefono
const TOKEN = "rb_native_push_token"; // ultimo token registrado

function plugin(): any | null {
  try {
    return (window as any).Capacitor?.Plugins?.FirebaseMessaging || null;
  } catch {
    return null;
  }
}

function platform(): "ios" | "android" | null {
  try {
    const p = (window as any).Capacitor?.getPlatform?.();
    return p === "ios" || p === "android" ? p : null;
  } catch {
    return null;
  }
}

export function nativePushAvailable(): boolean {
  return !!plugin() && !!platform();
}

export function nativePushEnabledFor(userId: string | null | undefined): boolean {
  try {
    return !!userId && localStorage.getItem(FLAG) === userId;
  } catch {
    return false;
  }
}

async function registerToken(token: string): Promise<number> {
  const p = platform();
  if (!p) return 0;
  const res = await fetch("/api/push/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: p }),
  });
  return res.status;
}

export type EnableResult = { ok: true } | { ok: false; reason: "unavailable" | "denied" | "server" | "error" };

// Pide permiso al telefono, obtiene su token y lo registra en el servidor para esta persona.
export async function enableNativePush(userId: string): Promise<EnableResult> {
  const fm = plugin();
  if (!fm || !platform()) return { ok: false, reason: "unavailable" };
  try {
    const perm = await fm.requestPermissions();
    if (perm?.receive !== "granted") return { ok: false, reason: "denied" };
    const { token } = await fm.getToken();
    if (!token) return { ok: false, reason: "error" };
    const status = await registerToken(token);
    if (status === 503) return { ok: false, reason: "server" };
    if (status !== 200) return { ok: false, reason: "error" };
    localStorage.setItem(FLAG, userId);
    localStorage.setItem(TOKEN, token);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error" };
  }
}

// Quita este telefono de los avisos (al apagar el interruptor o al cerrar sesion).
export async function disableNativePush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN);
    localStorage.removeItem(FLAG);
    localStorage.removeItem(TOKEN);
  } catch {}
  if (!token) return;
  try {
    await fetch("/api/push/device", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

// Primera vez que esta persona entra a la app en este telefono: se pide el permiso solo ("re-booking quiere
// enviarte notificaciones"), sin tener que ir a Mi Perfil. Se pregunta una sola vez por persona; si luego la apaga
// en Mi Perfil o dice que no, no se vuelve a insistir.
export async function autoEnableNativePush(userId: string | null | undefined): Promise<void> {
  const fm = plugin();
  if (!userId || !fm || !platform() || nativePushEnabledFor(userId)) return;
  const askedKey = `rb_native_push_asked_${userId}`;
  try {
    if (localStorage.getItem(askedKey)) return;
    const perm = await fm.checkPermissions();
    if (perm?.receive === "denied") return;
    localStorage.setItem(askedKey, "1");
    await enableNativePush(userId);
  } catch {
    // Si falla, queda el interruptor manual en Mi Perfil.
  }
}

let listenersReady = false;

// Al abrir la app: si esta persona tiene los avisos activos, renueva el token (puede cambiar) y deja
// escuchando dos cosas: token nuevo y toque sobre un aviso (abre la pantalla indicada).
export async function syncNativePush(userId: string | null | undefined): Promise<void> {
  const fm = plugin();
  if (!fm || !platform() || !nativePushEnabledFor(userId)) return;
  try {
    const perm = await fm.checkPermissions();
    if (perm?.receive !== "granted") return;
    const { token } = await fm.getToken();
    if (token && token !== localStorage.getItem(TOKEN)) {
      if ((await registerToken(token)) === 200) localStorage.setItem(TOKEN, token);
    }
    if (!listenersReady) {
      listenersReady = true;
      await fm.addListener("tokenReceived", async (e: { token?: string }) => {
        if (e?.token && nativePushEnabledFor(userId) && (await registerToken(e.token)) === 200) {
          localStorage.setItem(TOKEN, e.token);
        }
      });
      await fm.addListener("notificationActionPerformed", (e: any) => {
        const url = e?.notification?.data?.url;
        // Solo rutas internas de la app (nunca una direccion externa).
        if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) window.location.href = url;
      });
    }
  } catch {
    // Sin avisos no pasa nada: la app sigue funcionando.
  }
}
