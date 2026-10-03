"use client";

import { useEffect } from "react";

// Mientras `open` sea true, el boton "Atras" del celular (Android) o del navegador CIERRA el cuadro en
// vez de sacar al usuario de la pantalla. Agrega una entrada al historial al abrir y la quita si el
// cuadro se cierra por otro medio (X, tocar fuera, guardar). Si algo falla, no hace nada.
export function useBackToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    try {
      window.history.pushState({ backToClose: true }, "");
    } catch {
      return;
    }
    const onPop = () => close();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      try {
        if (window.history.state?.backToClose) window.history.back();
      } catch {}
    };
    // close se recrea en cada render; solo importa abrir/cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
