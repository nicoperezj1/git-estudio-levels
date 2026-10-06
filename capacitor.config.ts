import type { CapacitorConfig } from "@capacitor/cli";

// La app carga la misma web de re-booking dentro de una vista nativa.
// Pruebas: CAP_SERVER_URL=http://localhost:3000 (simulador de iPhone) o la direccion de la vista previa.
// Produccion: https://re-booking.cl (se fija al preparar la version para las tiendas).
const serverUrl = process.env.CAP_SERVER_URL || "http://localhost:3000";

const config: CapacitorConfig = {
  appId: "cl.rebooking.app",
  appName: "re-booking",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  // La web reconoce a la app por esta marca en el user agent (ver src/middleware.ts):
  // dentro de la app no hay pagina de presentacion ni registro, se parte en el login.
  appendUserAgent: "RebookingApp",
  ios: { contentInset: "always" },
};

export default config;
