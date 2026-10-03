import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Turns a display name into a URL-safe slug: strips accents, lowercases, and collapses
 * any run of non-alphanumeric characters into a single hyphen (e.g. "Javier García" ->
 * "javier-garcia"). Mirrors the normalization the 062_barber_booking_slug.sql backfill
 * used in SQL, so a professional created through the app gets the same shape of slug as
 * the ones that migration generated for pre-existing profiles.
 */
export function slugify(text: string): string {
  const withoutAccents = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // combining diacritical marks
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "profesional";
}

export function formatCurrency(amount: number): string {
  // El signo va delante del $ ("-$2.778.443"); es-CL lo ponia despues ("$-2.778.443").
  const abs = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
  return amount < 0 ? `-${abs}` : abs;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

// Punto 1 (Nico, 2026-09-24): "today" was computed everywhere with
// `new Date().toISOString().split("T")[0]`. toISOString() always returns the date in
// UTC, no matter where the code runs (server or browser) — and Chile is UTC-3/-4, so
// that "today" flips to tomorrow's date ~3-4 hours before real midnight in Chile
// (reported as happening around 21:45). That's what made income, Dashboard stats,
// agenda and closes look like they changed days too early. Use these instead of raw
// Date/toISOString wherever "today" (or an offset from it) needs to reflect Chile's
// actual calendar day.

/**
 * Current calendar date (YYYY-MM-DD) as observed in Chile (America/Santiago), regardless
 * of the server's or browser's own timezone/locale.
 */
export function todayInChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

/**
 * A given Chile calendar date (YYYY-MM-DD) shifted by `days` (negative = past, positive
 * = future). Built on a UTC-noon anchor so adding/subtracting days never gets tripped up
 * by DST or local-timezone rollover. Pure calendar arithmetic on the date string — the
 * input doesn't need to be "today", so this also powers "day before the one the user
 * picked" (Punto 8: selector de fecha en Dashboard) without re-deriving todayInChile().
 */
export function dateStrOffset(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().split("T")[0];
}

/**
 * Chile's "today" (see todayInChile) shifted by `days` (negative = past, positive =
 * future).
 */
export function chileDateOffset(days: number): string {
  return dateStrOffset(todayInChile(), days);
}

/**
 * UTC instant boundaries [startUtc, endUtc) for a Chile calendar day (YYYY-MM-DD), for
 * filtering timestamptz columns like `created_at`. Comparing created_at against naive
 * "YYYY-MM-DDT00:00:00"/"T23:59:59" strings (no offset) used Postgres' own session
 * timezone as the boundary, not Chile's midnight, so a transaction made late at night
 * could land in "the wrong day" in these queries even once todayInChile() is used to
 * pick the day itself. Computes Chile's real UTC offset for that date (handles any past
 * DST rule) instead of hardcoding -03:00/-04:00.
 */
export function chileDayBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const approx = new Date(`${dateStr}T12:00:00Z`);
  const utcWall = new Date(approx.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const clWall = new Date(approx.toLocaleString("en-US", { timeZone: "America/Santiago" })).getTime();
  const offsetMs = clWall - utcWall; // negative for Chile (behind UTC)
  const startUtc = new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() };
}

/**
 * Normalizes either a plain DATE (YYYY-MM-DD, no time/zone — used as-is, since it has no
 * timezone ambiguity to begin with) or a TIMESTAMPTZ string to Chile's calendar date.
 * Used (Nico, 27-sep) anywhere a value needs to be compared against another calendar date
 * without mixing in a raw UTC instant — see daysBetweenDateStrs below.
 */
export function toChileDateStr(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(value));
}

/**
 * Whole calendar days between two YYYY-MM-DD strings (fromStr - toStr), computed on pure
 * date arithmetic (UTC-midnight anchors, matching dateStrOffset above) so it never mixes
 * in a raw UTC instant (Date.now()) against a calendar-only date — the bug found in
 * /api/retention, which could show a client inactive/active a day off from reality right
 * at the Chile midnight boundary.
 */
export function daysBetweenDateStrs(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((from - to) / (1000 * 60 * 60 * 24));
}

/**
 * Start (YYYY-MM-DD, Chile calendar) of a tenant's CURRENT monthly billing/usage cycle,
 * anchored to the day-of-month it signed up (Nico, 27-sep — cuotas de mensajeria: "cada
 * negocio tiene su propio ciclo de 30 dias desde que se suscribio", not a shared calendar
 * month for everyone). Clamps to the last day of a shorter month (a business created on
 * the 31st cycles on Feb 28/29, Apr 30, etc. instead of overflowing into the next month),
 * and never returns a date before the tenant's own creation date.
 */
export function tenantCycleStart(createdAtIso: string): string {
  const created = toChileDateStr(createdAtIso);
  const [cy, cm, cd] = created.split("-").map(Number);
  const today = todayInChile();
  const [ty, tm] = today.split("-").map(Number);

  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-indexed
  const pad = (n: number) => String(n).padStart(2, "0");
  const clamp = (y: number, m: number, d: number) => Math.min(d, daysInMonth(y, m));

  let candY = ty, candM = tm;
  let candidate = `${candY}-${pad(candM)}-${pad(clamp(candY, candM, cd))}`;

  if (candidate > today) {
    candM -= 1;
    if (candM === 0) { candM = 12; candY -= 1; }
    candidate = `${candY}-${pad(candM)}-${pad(clamp(candY, candM, cd))}`;
  }

  return candidate < created ? created : candidate;
}
