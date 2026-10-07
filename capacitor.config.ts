import type { CapacitorConfig } from "@capacitor/cli";

// La app carga la misma web de re-booking dentro de una vista nativa.
// Por defecto (version para las tiendas): produccion.
// Pruebas en el simulador: CAP_SERVER_URL=http://localhost:3001 npx cap sync   (o la direccion de la vista previa).
const serverUrl = process.env.CAP_SERVER_URL || "https://www.re-booking.cl";

const config: CapacitorConfig = {
  appId: "cl.rebooking.app",
  appName: "re-booking",
  // Solo la pantalla "Sin conexion" va dentro de la app; el resto se carga desde la web.
  webDir: "app-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
  },
  // La web reconoce a la app por esta marca en el user agent (ver src/middleware.ts):
  // dentro de la app no hay pagina de presentacion ni registro, se parte en el login.
  appendUserAgent: "RebookingApp",
  // Sin vista previa ni menu al mantener apretado un enlace (Abrir enlace, Copiar enlace...).
  ios: { contentInset: "always", allowsLinkPreview: false },
};

export default config;
