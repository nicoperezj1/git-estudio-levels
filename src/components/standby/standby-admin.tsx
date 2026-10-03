"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { formatCurrency } from "@/lib/utils";

interface Report { reported_by_name: string | null; note: string; created_at: string }

// Standby del ADMINISTRADOR (entra con su codigo): revisa los problemas de caja en rojo, declara cuanto efectivo hay
// REALMENTE y deja la glosa de la solucion. El sistema guarda la diferencia como "ajuste de caja" y desde ahi la
// caja parte del monto real; los reportes quedan resueltos con su glosa.
export function StandbyAdmin({ admin, pin, onExit }: { admin: { id: string; name: string }; pin: string; onExit: () => void }) {
  const { showToast } = useToast();
  const { tenant } = useTenant();
  const [cash, setCash] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | { adjustment: number; resolved: number }>(null);

  const load = useCallback(() => {
    fetch(`/api/caja${tenant?.id ? `?tenantId=${tenant.id}` : ""}`).then((r) => r.json()).then((d) => setCash(Number(d?.summary?.expectedCash) || 0)).catch(() => {});
    fetch("/api/problemas").then((r) => r.json()).then((d) => setReports(d.reports || [])).catch(() => {});
  }, [tenant?.id]);
  useEffect(() => { load(); }, [load]);

  const diff = declared !== "" && cash !== null ? Number(declared) - cash : null;

  const resolve = async () => {
    if (saving || declared === "" || !note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/problemas/resolver", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, declaredCash: Number(declared), note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo guardar");
      setDone({ adjustment: d.adjustment, resolved: d.resolved });
      setDeclared(""); setNote(""); load();
      window.dispatchEvent(new Event("standby-refresh")); // la pestaña de vender actualiza su caja y quita el aviso rojo
    } catch (e: any) { showToast(e?.message || "No se pudo guardar", "error"); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">Hola, {admin.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-brand-gray">Revisión de caja (administrador)</p>
        </div>
        <button onClick={onExit} className="text-sm text-brand-gray hover:text-brand-dark">Cerrar sesión</button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center">
        <p className="text-xs text-gray-500">El sistema dice que hay en caja</p>
        <p className="mt-1 text-4xl font-black tabular-nums text-gray-900">{cash === null ? "…" : formatCurrency(cash)}</p>
      </div>

      {done && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Listo: {done.resolved} reporte(s) resuelto(s){done.adjustment !== 0 ? ` y la caja se ajustó ${done.adjustment > 0 ? "+" : ""}${formatCurrency(done.adjustment)}` : " (la caja ya coincidía)"}. El Standby parte desde el monto real.
        </div>
      )}

      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
        <p className="mb-2 text-sm font-semibold text-red-700">Problemas de caja abiertos ({reports.length})</p>
        {reports.length === 0 ? <p className="text-xs text-gray-500">No hay problemas abiertos.</p> : (
          <ul className="space-y-2">
            {reports.map((r, i) => (
              <li key={i} className="rounded-xl bg-white p-2.5 text-xs text-gray-700">
                <span className="text-gray-400">{r.reported_by_name || "Equipo"} · {new Date(r.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <p className="mt-0.5 whitespace-pre-wrap">{r.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-brand-dark">Resolver con el efectivo real</p>
        <div>
          <label className="block text-[11px] text-brand-gray">¿Cuánto efectivo hay realmente en la caja? ($)</label>
          <input type="number" min={0} value={declared} onChange={(e) => setDeclared(e.target.value)} className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-bold" />
          {diff !== null && diff !== 0 && <p className={`mt-1 text-xs ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>Diferencia contra el sistema: {diff > 0 ? "+" : ""}{formatCurrency(diff)} (queda como ajuste de caja)</p>}
          {diff === 0 && <p className="mt-1 text-xs text-gray-500">Coincide con el sistema: no hay ajuste.</p>}
        </div>
        <div>
          <label className="block text-[11px] text-brand-gray">Glosa de la solución</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder='Ej: "Se compró un pedido de aguas con dinero de la caja; vi las cámaras."' className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <button onClick={resolve} disabled={saving || declared === "" || !note.trim()} className="w-full rounded-xl bg-brand-blue py-3 font-bold text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Confirmar y quitar el reporte"}
        </button>
      </div>
    </div>
  );
}
