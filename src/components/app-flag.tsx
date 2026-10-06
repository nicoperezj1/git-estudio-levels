"use client";

import { useEffect } from "react";

// Marca <html> con la clase "rb-app" cuando la pagina corre dentro de la app movil
// (el user agent trae "RebookingApp", ver capacitor.config.ts). Sirve para ajustes
// solo de la app (ver globals.css). En la web normal no hace nada.
export function AppFlag() {
  useEffect(() => {
    if (navigator.userAgent.includes("RebookingApp")) document.documentElement.classList.add("rb-app");
  }, []);
  return null;
}
