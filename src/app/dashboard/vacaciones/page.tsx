"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { todayInChile } from "@/lib/utils";

interface Vacation { id: string; barber_id: string; start_date: string; end_date: string; note: string | null }
interface Pro { id: string; name: string }

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1;

// Vacaciones de profesionales: un rango de fechas por profesional. Ese profesional no aparece en la
// reserva online esos dias y su agenda se ve bloqueada ("Vacaciones").
export default function VacacionesPage() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [form, setForm] = useState({ barberId: "", startDate: todayInChile(), endDate: todayInChile(), note: "" });
  const [saving, setSaving] = useState(false);
  const today = todayInChile();

  const load = async () => {
    const q = tenant?.id ? `?tenantId=${tenant.id}` : "";
    const [v, p] = await Promise.all([
      fetch("/api/vacaciones").then((r) => r.json()).catch(() => ({ vacations: [] })),
      fetch(`/api/barberos${q}`).then((r) => r.json()).catch(() => []),
    ]);
    setVacations(v.vacations || []);
    setMigrationMissing(!!v.migrationMissing);
    setPros(Array.isArray(p) ? p.filter((x: any) => x.role === "barber" || x.also_attends_clients).map((x: any) => ({ id: x.id, name: x.name })) : []);
    setLoading(false);
  };
  useEffect(() => { if (!tenantLoading) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantLoading, tenant?.id]);

  const nameOf = (id: string) => pros.find((p) => p.id === id)?.name || "Profesional";

  const save = async () => {
    if (!form.barberId) { showToast("Elige un profesional", "error"); return; }
    if (form.endDate < form.startDate) { showToast("El término no puede ser antes del inicio", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/vacaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo guardar");
      showToast(d.existingAppointments > 0 ? `Vacaciones guardadas. Ojo: ya hay ${d.existingAppointments} cita(s) en esas fechas; muévelas o avísales.` : "Vacaciones guardadas", d.existingAppointments > 0 ? "error" : "success");
      setForm({ ...form, note: "" });
      load();
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally { setSaving(false); }
  };

  const remove = async (v: Vacation) => {
    const ok = await confirm({ title: "Quitar vacaciones", message: `${nameOf(v.barber_id)} volverá a aparecer en la reserva online esos días.`, confirmText: "Quitar", variant: "warning" });
    if (!ok) return;
    const res = await fetch(`/api/vacaciones?id=${v.id}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo quitar", "error"); return; }
    setVacations((x) => x.filter((y) => y.id !== v.id));
  };

  if (loading) return <Spinner />;
  const upcoming = vacations.filter((v) => v.end_date >= today);
  const past = vacations.filter((v) => v.end_date < today);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4 max-w-3xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Vacaciones</h1>
        <p className="text-sm text-brand-gray">Esos días el profesional no aparece en la reserva online y su agenda queda bloqueada.</p>
      </div>
      {migrationMissing && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">Falta aplicar la migración 095 en la base de datos.</p>}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 space-y-3">
        <h2 className="font-bold text-brand-dark">Agregar vacaciones</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <select value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm sm:col-span-2">
            <option value="">Elige un profesional…</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div>
            <label className="block text-[11px] text-brand-gray mb-0.5">Desde</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-brand-gray mb-0.5">Hasta</label>
            <input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Nota (opcional)" maxLength={200} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b"><h2 className="font-bold text-brand-dark">Próximas y en curso ({upcoming.length})</h2></div>
        {upcoming.length === 0 ? <p className="p-6 text-center text-sm text-brand-gray">No hay vacaciones programadas.</p> : (
          <ul className="divide-y">
            {upcoming.map((v) => (
              <li key={v.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-brand-dark">{nameOf(v.barber_id)}{v.start_date <= today && <span className="ml-2 text-[11px] rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">en curso</span>}</p>
                  <p className="text-sm text-brand-gray">{fmt(v.start_date)} – {fmt(v.end_date)} · {days(v.start_date, v.end_date)} día(s){v.note ? ` · ${v.note}` : ""}</p>
                </div>
                <button onClick={() => remove(v)} className="text-xs text-red-500 hover:underline shrink-0">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {past.length > 0 && (
        <details className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <summary className="p-4 cursor-pointer text-sm font-medium text-brand-gray">Pasadas ({past.length})</summary>
          <ul className="divide-y border-t">
            {past.map((v) => (
              <li key={v.id} className="px-4 py-3 text-sm text-brand-gray">{nameOf(v.barber_id)} · {fmt(v.start_date)} – {fmt(v.end_date)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
