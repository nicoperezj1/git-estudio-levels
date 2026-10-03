// Reglas de "primer profesional disponible" (Fase 6). El administrador elige UNA en Configuracion >
// Preferencias de reserva. La regla por defecto (least_agenda) es lo que hacia el boton hasta ahora.
//
//  1. least_agenda  : entre los que tienen la hora libre, el con MENOS citas ese dia.
//  2. earliest_slot : el profesional con la hora disponible mas cercana; si empatan, ganan los
//                     prioritarios y luego el de menos citas.
//  3. target_share  : % objetivo semanal por profesional; cada reserva automatica va al que esta mas
//                     lejos de su meta (la semana se cuenta de lunes a domingo).
//
// Siempre se parte de profesionales que ya pasaron los filtros (hacen el servicio, trabajan ese dia, no
// estan bloqueados ni de vacaciones). Nunca se pierde la reserva: si la regla no puede decidir, gana el
// de menos citas.
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;

export type BookingRule = "least_agenda" | "earliest_slot" | "target_share";
export const BOOKING_RULES: BookingRule[] = ["least_agenda", "earliest_slot", "target_share"];

export interface Candidate {
  id: string;
  appointments: number;       // citas del dia
  firstSlot?: string | null;  // primera hora libre del dia ("YYYY-MM-DDTHH:MM:SS"); null = sin horas
}

export interface RuleConfig {
  rule: BookingRule;
  priorityIds: string[];
  targets: Record<string, number>; // barberId -> % objetivo
}

const byAgenda = (a: Candidate, b: Candidate) => a.appointments - b.appointments || a.id.localeCompare(b.id);

// Reparte lo que falta para llegar a 100% entre quienes no tienen meta propia.
export function effectiveTargets(allIds: string[], targets: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let used = 0;
  for (const id of allIds) {
    if (targets[id] != null && targets[id] >= 0) { out[id] = targets[id]; used += targets[id]; }
  }
  const others = allIds.filter((id) => out[id] == null);
  const rest = Math.max(0, 100 - used);
  for (const id of others) out[id] = others.length ? rest / others.length : 0;
  return out;
}

// Ordena los candidatos segun la regla: el primero es el elegido.
export function rankCandidates(
  candidates: Candidate[],
  cfg: RuleConfig,
  ctx: { allProIds: string[]; autoCounts: Record<string, number> }
): Candidate[] {
  const list = [...candidates];
  if (cfg.rule === "earliest_slot") {
    const pri = new Set(cfg.priorityIds);
    return list.sort((a, b) => {
      const sa = a.firstSlot || "9999", sb = b.firstSlot || "9999";
      if (sa !== sb) return sa < sb ? -1 : 1;
      const pa = pri.has(a.id) ? 0 : 1, pb = pri.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return byAgenda(a, b);
    });
  }
  if (cfg.rule === "target_share") {
    const eff = effectiveTargets(ctx.allProIds, cfg.targets);
    const total = ctx.allProIds.reduce((s, id) => s + (ctx.autoCounts[id] || 0), 0);
    // Cuanto le falta a cada uno para su meta (en puntos de %): mayor falta = mas lejos de la meta.
    const gap = (id: string) => (eff[id] ?? 0) - (total > 0 ? ((ctx.autoCounts[id] || 0) / total) * 100 : 0);
    return list.sort((a, b) => gap(b.id) - gap(a.id) || byAgenda(a, b));
  }
  return list.sort(byAgenda);
}

// Lunes a domingo de la semana que contiene `date`.
export function weekRange(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  const from = new Date(d.getTime() - dow * 86400000);
  const to = new Date(from.getTime() + 6 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Recomendacion por estadisticas: reparte los % segun las ventas de servicios del mes anterior,
// potenciando al que vendio menos. Minimo 10% y maximo 60% por profesional; uno nuevo (sin ventas
// el mes pasado) recibe el promedio. Solo propone: el administrador decide.
export function recommendShares(sales: Record<string, number>, newIds: string[] = []): Record<string, number> {
  const ids = Object.keys(sales);
  const n = ids.length;
  if (n === 0) return {};
  if (n === 1) return { [ids[0]]: 100 };
  const min = Math.min(10, Math.floor(100 / n));
  const max = 60;
  const established = ids.filter((id) => !newIds.includes(id));
  const total = established.reduce((s, id) => s + Math.max(0, sales[id] || 0), 0);

  let raw: Record<string, number> = {};
  if (total <= 0 || established.length < 2) {
    for (const id of ids) raw[id] = 100 / n;
  } else {
    // Cuanto menos vendio, mas % recibe (lineal inverso).
    for (const id of established) raw[id] = (1 - Math.max(0, sales[id] || 0) / total) / (established.length - 1);
    const avg = established.reduce((s, id) => s + raw[id], 0) / established.length;
    for (const id of ids) if (newIds.includes(id)) raw[id] = avg;
    const sum = ids.reduce((s, id) => s + raw[id], 0);
    for (const id of ids) raw[id] = (raw[id] / sum) * 100;
  }

  // Limites 10-60 repartiendo el sobrante entre los que no estan fijos (iterativo).
  const fixed: Record<string, number> = {};
  let pct = { ...raw };
  for (let i = 0; i < 10; i++) {
    let changed = false;
    for (const id of ids) {
      if (fixed[id] != null) continue;
      if (pct[id] < min) { fixed[id] = min; changed = true; }
      else if (pct[id] > max) { fixed[id] = max; changed = true; }
    }
    const free = ids.filter((id) => fixed[id] == null);
    const fixedSum = Object.values(fixed).reduce((s, v) => s + v, 0);
    const freeRawSum = free.reduce((s, id) => s + raw[id], 0);
    pct = {};
    for (const id of ids) pct[id] = fixed[id] != null ? fixed[id] : free.length && freeRawSum > 0 ? (raw[id] / freeRawSum) * (100 - fixedSum) : (100 - fixedSum) / Math.max(1, free.length);
    if (!changed) break;
  }

  // Enteros que suman exactamente 100 (el resto se lo lleva quien tenia mas decimales).
  const out: Record<string, number> = {};
  let acc = 0;
  const parts = ids.map((id) => ({ id, v: pct[id], f: Math.floor(pct[id]) }));
  for (const p of parts) { out[p.id] = p.f; acc += p.f; }
  let left = 100 - acc;
  for (const p of [...parts].sort((a, b) => (b.v - b.f) - (a.v - a.f))) {
    if (left <= 0) break;
    if (out[p.id] + 1 <= max) { out[p.id] += 1; left -= 1; }
  }
  return out;
}

// ---------------- lectura de la configuracion (tolerante a que 095 no este) ----------------

export async function getRuleConfig(supabase: Admin, tenantId: string): Promise<RuleConfig> {
  const base: RuleConfig = { rule: "least_agenda", priorityIds: [], targets: {} };
  const { data: t, error } = await supabase.from("tenants").select("booking_rule").eq("id", tenantId).maybeSingle();
  if (error || !t) return base;
  const rule = (t as any).booking_rule as BookingRule;
  if (!BOOKING_RULES.includes(rule)) return base;
  const { data: pros } = await supabase.from("booking_rule_pros").select("barber_id, is_priority, target_pct").eq("tenant_id", tenantId);
  const cfg: RuleConfig = { rule, priorityIds: [], targets: {} };
  for (const p of (pros || []) as any[]) {
    if (p.is_priority) cfg.priorityIds.push(p.barber_id);
    if (p.target_pct != null) cfg.targets[p.barber_id] = Number(p.target_pct);
  }
  return cfg;
}

// Reservas automaticas de la semana por profesional (citas con auto_assigned = true).
export async function weeklyAutoCounts(supabase: Admin, tenantId: string, date: string): Promise<Record<string, number>> {
  const { from, to } = weekRange(date);
  const { data, error } = await supabase.from("appointments").select("barber_id")
    .eq("tenant_id", tenantId).eq("auto_assigned", true).gte("date", from).lte("date", to)
    .in("status", ["scheduled", "confirmed", "in_progress", "completed"]);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data || []) as any[]) out[r.barber_id] = (out[r.barber_id] || 0) + 1;
  return out;
}
