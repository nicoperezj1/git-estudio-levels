"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTenant } from "@/lib/tenant-context";

// "Apagar caja": oculta montos y acciones hasta que se ingrese el PIN de recepcion o del administrador. Vale para la
// pantalla Caja Y para el Punto de Venta del computador general (comparten el mismo bloqueo). No es "cerrar caja":
// el bloqueo vive en este navegador y se enciende con el PIN, que se valida en el servidor.
export const cajaLockKey = (tenantId?: string | null) => `caja_off_${tenantId || "x"}`;

// ¿El negocio activo el bloqueo? (Configuracion > Caja y Standby). null = todavia cargando.
export function useCajaLockEnabled(): boolean | null {
  const { tenant, loading } = useTenant();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    fetch(`/api/settings/caja-seguridad${tenant?.id ? `?tenantId=${tenant.id}` : ""}`)
      .then((r) => r.json()).then((d) => setOn(!!d?.cajaLock)).catch(() => setOn(false));
  }, [loading, tenant?.id]);
  return on;
}

export function CajaLockGate({ children }: { children: (lock: (() => void) | undefined) => ReactNode }) {
  const { tenant, loading } = useTenant();
  const enabled = useCajaLockEnabled();
  const key = cajaLockKey(tenant?.id);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    try { setLocked(localStorage.getItem(key) === "1"); } catch {}
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tenant?.id]);

  const lock = () => { try { localStorage.setItem(key, "1"); } catch {} setLocked(true); setPin(""); setError(""); };
  const unlock = async () => {
    if (pin.length !== 4 || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/caja/desbloquear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.valid) { setError(d.error || "PIN incorrecto"); return; }
      try { localStorage.removeItem(key); } catch {}
      setLocked(false); setPin("");
    } finally { setBusy(false); }
  };

  if (!ready || enabled === null) return null;
  // Si el negocio no usa el bloqueo, todo funciona como siempre (y se ignora cualquier bloqueo viejo).
  if (!enabled) return <>{children(undefined)}</>;
  if (locked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Caja apagada</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">Ingresa el PIN de recepción o del administrador para encenderla.</p>
          <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
            placeholder="••••" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em]" />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button onClick={unlock} disabled={pin.length !== 4 || busy} className="w-full mt-4 py-3 bg-brand-blue text-white rounded-xl font-bold disabled:opacity-40">
            {busy ? "Verificando…" : "Encender caja"}
          </button>
        </div>
      </div>
    );
  }
  return <>{children(lock)}</>;
}
