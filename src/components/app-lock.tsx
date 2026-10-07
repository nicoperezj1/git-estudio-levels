"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/native-app";
import { biometricLockEnabled, biometricVerify } from "@/lib/biometric";

// Bloqueo con Face ID / huella (opcional, solo en la app movil). Se pide al abrir la app y al volver
// a ella tras mas de 30 segundos en segundo plano. Se activa en Mi Perfil.
const AWAY_MS = 30_000;

export function AppLock() {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const awaySince = useRef<number | null>(null);
  const router = useRouter();

  const unlock = useCallback(async () => {
    setChecking(true);
    const ok = await biometricVerify();
    setChecking(false);
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (biometricLockEnabled()) {
      setLocked(true);
      unlock();
    }
    const onVisibility = () => {
      if (document.hidden) {
        awaySince.current = Date.now();
        return;
      }
      const away = awaySince.current;
      awaySince.current = null;
      if (away && Date.now() - away > AWAY_MS && biometricLockEnabled()) {
        setLocked(true);
        unlock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [unlock]);

  const logout = async () => {
    try { localStorage.removeItem("tenant_override"); } catch {}
    await createClient().auth.signOut();
    setLocked(false);
    router.push("/login");
    router.refresh();
  };

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-white px-8 text-center">
      <img src="/logo-icon.png" alt="re-booking" className="h-16 w-16" />
      <h2 className="text-lg font-bold text-brand-dark">re-booking está bloqueado</h2>
      <button
        type="button"
        onClick={unlock}
        disabled={checking}
        className="w-full max-w-xs rounded-2xl bg-brand-blue px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {checking ? "Verificando..." : "Desbloquear"}
      </button>
      <button type="button" onClick={logout} className="text-xs text-brand-gray underline">
        Cerrar sesión
      </button>
    </div>
  );
}
