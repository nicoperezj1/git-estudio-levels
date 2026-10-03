// Las horas de las citas se guardan como "hora de pared de Chile" escrita como UTC (el calendario
// lee la hora directo del texto). El navegador manda "2026-10-06T10:00:00" sin zona; `new Date()`
// lo interpretaba en la zona del SERVIDOR: en Vercel (UTC) daba la hora correcta, pero en un
// servidor con hora de Chile (por ejemplo `npm run dev` en un Mac) la cita se corria 3 horas.
// Aca un texto sin zona se toma siempre como UTC, asi funciona igual en cualquier servidor.
export function parseWallClock(value: string): Date {
  return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}
