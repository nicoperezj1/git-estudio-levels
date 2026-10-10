"use client";

// Face ID / huella dentro de la app movil. El plugin nativo (@capgo/capacitor-native-biometric) lo
// registra la app; desde la web se alcanza por el puente de Capacitor. En la web normal no existe
// y todo devuelve "no disponible". La preferencia vive solo en este telefono (localStorage).

const KEY = "rb_biometric_lock";

function plugin(): any | null {
  try {
    return (window as any).Capacitor?.Plugins?.NativeBiometric || null;
  } catch {
    return null;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const r = await p.isAvailable({ useFallback: true });
    return !!r?.isAvailable;
  } catch {
    return false;
  }
}

// true si la persona se identifico; false si cancelo o fallo.
export async function biometricVerify(reason = "Desbloquea re-booking"): Promise<boolean> {
  const p = plugin();
  if (!p) return true; // sin plugin no se puede bloquear: no dejar a nadie fuera
  try {
    await p.verifyIdentity({ reason, title: "re-booking", subtitle: reason, useFallback: true, maxAttempts: 3 });
    return true;
  } catch {
    return false;
  }
}

export function biometricLockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
}
