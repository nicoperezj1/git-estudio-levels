"use client";

import { useCallback, useEffect, useState } from "react";

// ¿El negocio activó el centro de avisos? y cuántos avisos sin leer tiene la persona. Se consulta al montar y cada
// 60 s mientras la pestaña está visible. Compartido por la campanita y el menú.
export function useNotificationCenter() {
  const [state, setState] = useState<{ enabled: boolean; unread: number; loaded: boolean }>({ enabled: false, unread: 0, loaded: false });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/notificaciones?count=1", { cache: "no-store" });
      if (!r.ok) { setState((s) => ({ ...s, loaded: true })); return; }
      const d = await r.json();
      setState({ enabled: !!d.enabled, unread: Number(d.unread) || 0, loaded: true });
    } catch {
      setState((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("rb:notifications-changed", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("rb:notifications-changed", refresh); };
  }, [refresh]);

  return { ...state, refresh };
}
