"use client";

import { useEffect, useState } from "react";

// true cuando la pagina corre dentro de la app movil (el user agent trae "RebookingApp",
// ver capacitor.config.ts). Se calcula en el navegador, asi que el primer render es false.
export function isNativeApp(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("RebookingApp");
}

export function useIsNativeApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isNativeApp()), []);
  return inApp;
}
