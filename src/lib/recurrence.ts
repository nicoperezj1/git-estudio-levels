// Bloqueos repetidos del calendario: de una fecha de inicio y una regla sale la lista de fechas (YYYY-MM-DD).
// Todo con aritmetica de fechas en UTC (sin zonas horarias), igual que el resto del calendario.
export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";
export interface RepeatRule {
  freq: RepeatFreq;
  interval?: number;       // cada N dias/semanas/meses/anios (1 por defecto)
  weekdays?: number[];     // solo semanal: 0=Dom ... 6=Sab (por defecto, el dia de la fecha de inicio)
  until?: string;          // hasta esa fecha (incluida)
  count?: number;          // o cantidad de veces (incluye la primera)
}

export const MAX_REPEATS = 400;
const DAY = 86400000;

const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
}

function addMonths(startMs: number, months: number): number {
  const d = new Date(startMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // si el mes no tiene ese dia (31), queda el ultimo
  return Date.UTC(y, m, Math.min(day, last));
}

export function expandRepeat(start: string, rule: RepeatRule): string[] {
  if (!isValidDate(start)) return [];
  const interval = Math.max(1, Math.min(60, Math.floor(Number(rule.interval) || 1)));
  const startMs = parse(start);
  const limitMs = isValidDate(rule.until) ? parse(rule.until) : null;
  const count = Number.isFinite(Number(rule.count)) && Number(rule.count) >= 1 ? Math.min(MAX_REPEATS, Math.floor(Number(rule.count))) : null;
  if (limitMs === null && count === null) return [start];
  const maxMs = startMs + 5 * 366 * DAY; // tope de 5 anios
  const out: number[] = [];
  const full = () => out.length >= MAX_REPEATS || (count !== null && out.length >= count);
  const ok = (t: number) => t >= startMs && t <= maxMs && (limitMs === null || t <= limitMs);

  if (rule.freq === "daily") {
    for (let t = startMs, i = 0; ok(t) && !full() && i < 5000; t += interval * DAY, i++) out.push(t);
  } else if (rule.freq === "weekly") {
    const wds = (rule.weekdays && rule.weekdays.length ? rule.weekdays : [new Date(startMs).getUTCDay()])
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    const mondayOffset = (new Date(startMs).getUTCDay() + 6) % 7;
    const week0 = startMs - mondayOffset * DAY; // lunes de la semana de inicio
    outer: for (let k = 0; k < 2000; k++) {
      const weekStart = week0 + k * 7 * interval * DAY;
      if (weekStart > maxMs || (limitMs !== null && weekStart > limitMs)) break;
      for (const wd of [...wds].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        const t = weekStart + ((wd + 6) % 7) * DAY;
        if (t < startMs) continue;
        if (!ok(t)) { if (limitMs !== null && t > limitMs) break outer; continue; }
        out.push(t);
        if (full()) break outer;
      }
    }
  } else {
    const step = rule.freq === "monthly" ? interval : interval * 12;
    for (let i = 0; i < 2000; i++) {
      const t = addMonths(startMs, i * step);
      if (!ok(t) || full()) break;
      out.push(t);
    }
  }
  return out.map(fmt);
}
