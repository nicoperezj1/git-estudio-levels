"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Video, Building2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

// Calendario de reuniones (solo super admin, cada uno ve las suyas). Hora de Chile escrita tal cual.
interface Meeting {
  id: string; title: string; meeting_date: string; start_time: string; end_time: string | null;
  tenant_id: string | null; tenant_name: string | null; notes: string | null; link: string | null;
}
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const DOW = ["L", "M", "M", "J", "V", "S", "D"];

export default function ReunionesPage() {
  const { showToast } = useToast();
  const today = todayStr();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<null | Partial<Meeting>>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const from = ymd(cursor.y, cursor.m, 1);
    const to = ymd(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate());
    const res = await fetch(`/api/superadmin/meetings?from=${from}&to=${to}`);
    if (res.status === 503) { setMissing(true); setMeetings([]); }
    else if (res.ok) { setMissing(false); setMeetings(await res.json()); }
    else showToast("No se pudieron cargar las reuniones", "error");
    setLoading(false);
  };
  useEffect(() => { load(); }, [cursor.y, cursor.m]);
  useEffect(() => {
    fetch("/api/superadmin/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setTenants((d || []).map((t: any) => ({ id: t.id, name: t.name })))).catch(() => {});
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach((m) => { (map[m.meeting_date] ||= []).push(m); });
    return map;
  }, [meetings]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7; // semana parte el lunes
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });

  const listDays = selected ? [selected] : Object.keys(byDay).sort();
  const label = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  const save = async () => {
    if (!form || saving) return;
    setSaving(true);
    const res = await fetch("/api/superadmin/meetings", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const r = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { showToast(r.error || "No se pudo guardar", "error"); return; }
    showToast(form.id ? "Reunión actualizada" : "Reunión creada", "success");
    setForm(null);
    load();
  };
  const remove = async () => {
    if (!form?.id) return;
    if (!confirm("¿Eliminar esta reunión?")) return;
    const res = await fetch(`/api/superadmin/meetings?id=${form.id}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo eliminar", "error"); return; }
    showToast("Reunión eliminada", "success");
    setForm(null);
    load();
  };

  const input = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm";

  return (
    <div className="p-3 md:p-6 max-w-3xl space-y-3 md:space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Reuniones</h1>
        <button onClick={() => setForm({ meeting_date: selected || today, start_time: "10:00", end_time: "10:30", title: "" })}
          className="flex items-center gap-1.5 rounded-xl bg-brand-blue px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Nueva
        </button>
      </div>

      {missing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta aplicar la migración 111 en la base de datos para usar las reuniones.
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-3 md:p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <button aria-label="Mes anterior" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-gray hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <p className="text-sm font-bold capitalize text-brand-dark">{monthLabel}</p>
          <button aria-label="Mes siguiente" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-gray hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW.map((d, i) => <div key={i} className="py-1 text-[11px] font-semibold text-brand-gray">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = ymd(cursor.y, cursor.m, d);
            const n = byDay[key]?.length || 0;
            const isSel = selected === key;
            return (
              <button key={i} onClick={() => setSelected(isSel ? null : key)}
                className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-sm transition-colors ${isSel ? "bg-brand-blue text-white" : key === today ? "bg-brand-blue/10 font-bold text-brand-blue" : "text-brand-dark hover:bg-gray-50"}`}>
                {d}
                {n > 0 && <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${isSel ? "bg-white" : "bg-brand-blue"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {listDays.length === 0 && <p className="py-6 text-center text-sm text-brand-gray">{selected ? "Sin reuniones ese día." : "No hay reuniones este mes."}</p>}
          {listDays.map((d) => (
            <div key={d}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gray capitalize">{label(d)}</p>
              <div className="space-y-2">
                {(byDay[d] || []).map((m) => (
                  <button key={m.id} onClick={() => setForm(m)} className="w-full rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm hover:border-brand-blue/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-brand-dark">{m.title}</p>
                        {m.tenant_name && <p className="mt-0.5 flex items-center gap-1 text-xs text-brand-gray"><Building2 className="h-3 w-3" />{m.tenant_name}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold text-brand-blue">{m.start_time}</p>
                        {m.end_time && <p className="text-[11px] text-brand-gray">a {m.end_time}</p>}
                      </div>
                    </div>
                    {m.link && <p className="mt-1.5 flex items-center gap-1 text-xs text-brand-blue"><Video className="h-3 w-3" />Videollamada</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4" onClick={() => setForm(null)}>
          <div className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark">{form.id ? "Editar reunión" : "Nueva reunión"}</h3>
            <input className={input} placeholder="Título (ej. Demo con Salón Fluye)" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input type="date" className={input} value={form.meeting_date || ""} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
              <input type="time" className={input} value={form.start_time || ""} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <input type="time" className={input} value={form.end_time || ""} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <select className={input} value={form.tenant_id || ""} onChange={(e) => setForm({ ...form, tenant_id: e.target.value || null })}>
              <option value="">Sin negocio asociado</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className={input} placeholder="Link de videollamada (opcional)" value={form.link || ""} onChange={(e) => setForm({ ...form, link: e.target.value })} />
            <textarea className={input} rows={3} placeholder="Notas (opcional)" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex items-center gap-2 pt-1">
              {form.id && <button onClick={remove} aria-label="Eliminar" className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 text-red-600"><Trash2 className="h-4 w-4" /></button>}
              <button onClick={() => setForm(null)} className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-medium text-brand-gray">Cancelar</button>
              <button onClick={save} disabled={saving} className="h-11 flex-1 rounded-xl bg-brand-blue text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
