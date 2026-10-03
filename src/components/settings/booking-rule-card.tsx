"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";

type Rule = "least_agenda" | "earliest_slot" | "target_share";
interface Pro { id: string; name: string }

const RULES: Array<{ key: Rule; title: string; desc: string }> = [
  { key: "least_agenda", title: "Menos agenda en el día", desc: "Entre los que tienen la hora libre, el que tiene menos citas ese día. (Lo que hace hoy.)" },
  { key: "earliest_slot", title: "Primera hora según la búsqueda del cliente", desc: "El profesional con la hora disponible más cercana. Si empatan, ganan los prioritarios." },
  { key: "target_share", title: "Mayor % para profesionales elegidos", desc: "Defines qué % de las reservas automáticas debe recibir cada uno por semana. Cada reserva va al que está más lejos de su meta." },
];

// Preferencias de reserva (Fase 6): que regla usa "Primer profesional disponible". Solo cuentan
// profesionales que hacen el servicio, trabajan ese dia, tienen la hora libre y no estan bloqueados ni
// de vacaciones; si el elegido no puede, pasa al siguiente (nunca se pierde la reserva).
export function BookingRuleCard() {
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [pros, setPros] = useState<Pro[]>([]);
  const [rule, setRule] = useState<Rule>("least_agenda");
  const [priority, setPriority] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [reco, setReco] = useState<null | { monthLabel: string; sales: Record<string, number>; newIds: string[] }>(null);
  const [recoBusy, setRecoBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/reglas-reserva").then((r) => r.json()).then((d) => {
      if (d?.error) return;
      setPros(d.pros || []);
      setRule(d.rule || "least_agenda");
      setPriority(d.priorityIds || []);
      setTargets(Object.fromEntries(Object.entries(d.targets || {}).map(([k, v]) => [k, String(v)])));
      setWindowDays(d.windowDays ?? null);
      setMigrationMissing(!!d.migrationMissing);
      setLoaded(true);
    }).catch(() => {});
  }, []);

  const sum = pros.reduce((s, p) => s + (Number(targets[p.id]) || 0), 0);
  const nameOf = (id: string) => pros.find((p) => p.id === id)?.name || "";

  const recommend = async () => {
    setRecoBusy(true);
    try {
      const d = await fetch("/api/settings/reglas-reserva/recomendar").then((r) => r.json());
      if (d?.error) throw new Error(d.error);
      setTargets(Object.fromEntries(Object.entries(d.recommended as Record<string, number>).map(([k, v]) => [k, String(v)])));
      setReco({ monthLabel: d.monthLabel, sales: d.sales, newIds: d.newIds });
    } catch (e: any) {
      showToast(e?.message || "No se pudo calcular", "error");
    } finally { setRecoBusy(false); }
  };

  const save = async () => {
    if (rule === "target_share" && sum > 100) { showToast(`Los porcentajes suman ${sum}%. El máximo es 100%.`, "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/reglas-reserva", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule, priorityIds: priority, targets, windowDays, markRecoSeen: !!reco || rule === "target_share" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo guardar");
      showToast("Preferencias de reserva guardadas", "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally { setSaving(false); }
  };

  if (!loaded) return null;
  return (
    <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
      <div>
        <h2 className="font-bold text-brand-dark">Preferencias de reserva</h2>
        <p className="text-xs text-brand-gray">Cómo se elige al profesional cuando el cliente toca "Primer profesional disponible".</p>
      </div>

      <div>
        <p className="text-sm font-medium text-brand-dark mb-1">Días que el cliente puede agendar</p>
        <p className="text-xs text-brand-gray mb-2">Cuántos días hacia adelante aparecen en la reserva online (contando hoy).</p>
        <div className="flex flex-wrap gap-2">
          {[7, 14, 21, 31].map((n) => (
            <button key={n} type="button" onClick={() => setWindowDays(n)}
              className={`px-3 py-1.5 rounded-full text-sm border ${windowDays === n ? "bg-brand-blue text-white border-brand-blue" : "border-gray-200 text-brand-dark"}`}>
              {n} días
            </button>
          ))}
          <button type="button" onClick={() => setWindowDays(null)}
            className={`px-3 py-1.5 rounded-full text-sm border ${windowDays === null ? "bg-brand-blue text-white border-brand-blue" : "border-gray-200 text-brand-dark"}`}>
            Predeterminado
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {RULES.map((r) => (
          <label key={r.key} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${rule === r.key ? "border-brand-blue bg-brand-blue/5" : "border-gray-200"}`}>
            <input type="radio" name="booking-rule" checked={rule === r.key} onChange={() => setRule(r.key)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-brand-dark">{r.title}</span>
              <span className="block text-xs text-brand-gray">{r.desc}</span>
            </span>
          </label>
        ))}
      </div>

      {rule === "earliest_slot" && pros.length > 0 && (
        <div>
          <p className="text-sm font-medium text-brand-dark mb-1">Profesionales prioritarios</p>
          <p className="text-xs text-brand-gray mb-2">Si dos tienen la misma hora, gana uno de estos. Puedes elegir uno o varios.</p>
          <div className="flex flex-wrap gap-2">
            {pros.map((p) => {
              const on = priority.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => setPriority((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                  className={`px-3 py-1.5 rounded-full text-sm border ${on ? "bg-brand-blue text-white border-brand-blue" : "border-gray-200 text-brand-dark"}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rule === "target_share" && pros.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-brand-dark">% objetivo por semana</p>
            <button type="button" onClick={recommend} disabled={recoBusy || pros.length < 2} className="text-xs font-semibold text-brand-blue hover:underline disabled:opacity-50">
              {recoBusy ? "Calculando…" : "Recomendado por estadísticas"}
            </button>
          </div>
          <div className="space-y-2">
            {pros.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-brand-dark truncate">{p.name}</span>
                <input type="number" min={0} max={100} value={targets[p.id] ?? ""} placeholder="resto"
                  onChange={(e) => setTargets((t) => ({ ...t, [p.id]: e.target.value }))}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                <span className="text-sm text-brand-gray">%</span>
              </div>
            ))}
          </div>
          <p className={`text-xs ${sum > 100 ? "text-red-500" : "text-brand-gray"}`}>
            Suman {sum}% (máximo 100%). Lo que falte se reparte entre los que dejes sin porcentaje.
          </p>
          {reco && (
            <p className="text-xs text-brand-gray rounded-lg bg-brand-light/70 p-2">
              Propuesta según las ventas de servicios de {reco.monthLabel}:{" "}
              {pros.map((p) => `${nameOf(p.id)} ${reco.newIds.includes(p.id) ? "(nuevo)" : formatCurrency(reco.sales[p.id] || 0)}`).join(" · ")}.
              Potencia al que vendió menos (mínimo 10%, máximo 60%). Revísala y toca Guardar si te sirve.
            </p>
          )}
        </div>
      )}

      {migrationMissing && <p className="text-xs text-red-500">Falta aplicar la migración 095 en la base de datos.</p>}
      <button onClick={save} disabled={saving} className="px-5 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium disabled:opacity-50">
        {saving ? "Guardando…" : "Guardar preferencias"}
      </button>
    </div>
  );
}
