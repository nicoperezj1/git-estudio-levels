"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
// Lunes primero (como se lee una semana de trabajo); day_of_week sigue siendo 0=Domingo.
const dayOrder = [1, 2, 3, 4, 5, 6, 0];

interface BreakItem { start: string; end: string; name: string; spots: number | null }
interface ScheduleDay {
  day_of_week: number;
  is_working: boolean;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  breaks?: Array<{ start: string; end: string; name: string | null; spots: number | null }>;
}

const hhmm = (t: string | null | undefined, fallback: string) => (t ? String(t).slice(0, 5) : fallback);
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };

const timeCls = "min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm tabular-nums text-brand-dark outline-none focus:border-brand-blue";

export function BarberScheduleEditor({ barberId, showToast }: { barberId: string; showToast: (msg: string, type?: "success" | "error" | "info") => void }) {
  const { tenant } = useTenant();
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [breaks, setBreaks] = useState<Record<number, BreakItem[]>>({});
  const [saving, setSaving] = useState(false);
  // Cupos por bloque (solo kinesiologia): un break puede cerrar algunos cupos y no todos.
  const [cap, setCap] = useState(1);

  useEffect(() => {
    fetch(`/api/barber-schedule?barberId=${barberId}`)
      .then((r) => r.json())
      .then((data) => {
        const days: ScheduleDay[] = Array.isArray(data) ? data : [];
        setSchedule(days);
        const b: Record<number, BreakItem[]> = {};
        for (const d of days) {
          const list = d.breaks ?? (d.break_start && d.break_end ? [{ start: d.break_start, end: d.break_end, name: null, spots: null }] : []);
          b[d.day_of_week] = list.map((x) => ({ start: hhmm(x.start, "13:00"), end: hhmm(x.end, "14:00"), name: x.name || "", spots: x.spots ?? null }));
        }
        setBreaks(b);
      });
  }, [barberId]);

  useEffect(() => {
    let t = tenant?.id || "";
    if (!t) { try { t = JSON.parse(localStorage.getItem("tenant_override") || "{}").tenantId || ""; } catch { /* sin override */ } }
    fetch(`/api/settings/slot-capacity${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json())
      .then((d) => setCap(d?.eligible ? Math.max(1, Number(d?.max) || 1) : 1))
      .catch(() => setCap(1));
  }, [tenant?.id]);

  const updateDay = (dayIndex: number, field: string, value: any) =>
    setSchedule((prev) => prev.map((d) => (d.day_of_week === dayIndex ? { ...d, [field]: value } : d)));

  const setDayBreaks = (dow: number, fn: (list: BreakItem[]) => BreakItem[]) =>
    setBreaks((prev) => ({ ...prev, [dow]: fn(prev[dow] || []) }));

  const addBreak = (dow: number) =>
    setDayBreaks(dow, (list) => {
      // Si ya hay uno, el nuevo parte justo cuando termina el ultimo (1 h); si no, 13:00 a 14:00.
      const last = list[list.length - 1];
      const startMin = last ? toMin(last.end) : 13 * 60;
      const endMin = Math.min(startMin + 60, 23 * 60 + 45);
      const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return [...list, { start: f(startMin), end: f(endMin), name: "", spots: null }];
    });

  const save = async () => {
    for (const d of schedule) {
      for (const b of d.is_working ? breaks[d.day_of_week] || [] : []) {
        if (toMin(b.end) <= toMin(b.start)) { showToast(`${dayNames[d.day_of_week]}: un break termina antes de empezar`, "error"); return; }
      }
    }
    setSaving(true);
    try {
      const payload = schedule.map((d) => ({
        ...d,
        breaks: (breaks[d.day_of_week] || []).map((b) => ({ start: b.start, end: b.end, name: b.name.trim() || null, spots: cap > 1 ? b.spots : null })),
      }));
      const res = await fetch("/api/barber-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId, schedule: payload }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) showToast(out.error || "No se pudo guardar el horario", "error");
      else if (out.warning) showToast(out.warning, "info");
      else showToast("Horario guardado", "success");
    } finally {
      setSaving(false);
    }
  };

  const byDow = new Map(schedule.map((d) => [d.day_of_week, d]));

  return (
    <div className="space-y-2.5">
      {dayOrder.map((dow) => {
        const day = byDow.get(dow);
        if (!day) return null;
        const list = breaks[dow] || [];
        return (
          <div key={dow} className={`rounded-2xl border px-3.5 py-3 transition-colors ${day.is_working ? "border-gray-100 bg-white" : "border-transparent bg-gray-50"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* Interruptor del dia */}
              <button
                type="button"
                role="switch"
                aria-checked={day.is_working}
                onClick={() => updateDay(dow, "is_working", !day.is_working)}
                className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${day.is_working ? "bg-brand-blue" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${day.is_working ? "left-[18px]" : "left-0.5"}`} />
              </button>
              <span className={`w-20 text-sm font-semibold ${day.is_working ? "text-brand-dark" : "text-brand-gray"}`}>{dayNames[dow]}</span>
              {day.is_working ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <input type="time" value={hhmm(day.start_time, "10:00")} onChange={(e) => updateDay(dow, "start_time", e.target.value)} className={`${timeCls} w-[6.2rem]`} />
                  <span className="text-xs text-brand-gray">a</span>
                  <input type="time" value={hhmm(day.end_time, "20:00")} onChange={(e) => updateDay(dow, "end_time", e.target.value)} className={`${timeCls} w-[6.2rem]`} />
                </div>
              ) : (
                <span className="text-xs text-brand-gray">Día libre</span>
              )}
            </div>

            {day.is_working && (
              <div className="mt-2.5 space-y-2 border-t border-gray-100 pt-2.5">
                {list.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <input
                      value={b.name}
                      maxLength={40}
                      onChange={(e) => setDayBreaks(dow, (l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Nombre (opcional)"
                      className="min-w-0 flex-1 basis-32 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-blue"
                    />
                    <input type="time" value={b.start} onChange={(e) => setDayBreaks(dow, (l) => l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={`${timeCls} w-[6.2rem]`} />
                    <span className="text-xs text-brand-gray">a</span>
                    <input type="time" value={b.end} onChange={(e) => setDayBreaks(dow, (l) => l.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={`${timeCls} w-[6.2rem]`} />
                    {cap > 1 && (
                      <select
                        value={b.spots ?? cap}
                        onChange={(e) => { const v = Number(e.target.value); setDayBreaks(dow, (l) => l.map((x, j) => (j === i ? { ...x, spots: v >= cap ? null : v } : x))); }}
                        className={`${timeCls} pr-1`}
                        title="Cuántos cupos del bloque cierra este break"
                      >
                        {Array.from({ length: cap }, (_, k) => k + 1).map((n) => (
                          <option key={n} value={n}>{n === cap ? `Todos los cupos (${cap})` : `${n} ${n === 1 ? "cupo" : "cupos"}`}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" onClick={() => setDayBreaks(dow, (l) => l.filter((_, j) => j !== i))} aria-label="Quitar break" className="rounded-full p-1 text-brand-gray hover:bg-gray-100 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addBreak(dow)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">
                  <Plus className="h-3.5 w-3.5" /> {list.length === 0 ? "Agregar break" : "Agregar otro break"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={save}
        disabled={saving}
        className="mt-1 rounded-xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar horario"}
      </button>
    </div>
  );
}
