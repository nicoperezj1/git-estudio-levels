// "Necesitas ayuda": areas del sistema, limites y formato del numero de caso (compartido por la pantalla y la API).
export const SUPPORT_AREAS = [
  "Calendario / Agenda",
  "Reserva online (link de reservas)",
  "Punto de Venta / Cobros",
  "Caja diaria",
  "Clientes",
  "Servicios y precios",
  "Profesionales y horarios",
  "Inventario / Productos",
  "Ingresos, egresos y cierre mensual",
  "Plan y facturación",
  "WhatsApp / Avisos",
  "Otro",
] as const;

export const SUPPORT_MAX_IMAGES = 5;
export const SUPPORT_MAX_TOTAL_BYTES = 4_200_000; // el limite del servidor para un envio es ~4,5 MB

export function formatCaseNumber(n: number | null | undefined): string {
  if (n && Number.isFinite(Number(n))) return `RB-${String(n).padStart(5, "0")}`;
  // Sin la tabla (migracion 107) se arma un codigo con fecha y letras al azar.
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RB-${ymd}-${rnd}`;
}
