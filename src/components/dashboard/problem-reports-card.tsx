"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/premium";
import { useToast } from "@/components/ui/toast";

interface Report { id: string; reported_by_name: string | null; context: string; note: string; created_at: string; shown_cash?: number | null }

const CONTEXT_LABEL: Record<string, string> = { caja: "Caja", standby: "Standby", reduccion_efectivo: "Reducción de efectivo", otro: "Otro" };

// Problemas que reportaron los profesionales o recepcion (ej. "faltan $10.000"). Quedan aqui hasta que
// el administrador los marca como resueltos. Si no hay ninguno, no ocupa espacio en el Dashboard.
export function ProblemReportsCard() {
  const [reports, setReports] = useState<Report[]>([]);
  const { showToast } = useToast();
  const load = () => fetch("/api/problemas").then((r) => r.json()).then((d) => setReports(d.reports || [])).catch(() => setReports([]));
  useEffect(() => { load(); }, []);

  const resolve = async (id: string) => {
    const res = await fetch("/api/problemas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) { showToast("No se pudo marcar como resuelto", "error"); return; }
    setReports((r) => r.filter((x) => x.id !== id));
  };

  if (reports.length === 0) return null;
  return (
    <Panel title="Problemas reportados" subtitle="Avisos del equipo. Márcalos como resueltos cuando los revises.">
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl bg-amber-50/70 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-brand-gray">
                {r.reported_by_name || "Equipo"} · {CONTEXT_LABEL[r.context] || r.context} ·{" "}
                {new Date(r.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              {r.context === "otro" ? (
                <button onClick={() => resolve(r.id)} className="text-xs font-semibold text-emerald-600 hover:underline">Resuelto</button>
              ) : (
                <span className="text-[11px] font-semibold text-red-500">Se resuelve en Standby</span>
              )}
            </div>
            <p className="mt-1 text-sm text-brand-dark whitespace-pre-wrap">{r.note}</p>
            {r.shown_cash != null && <p className="mt-0.5 text-[11px] text-brand-gray">La caja mostraba ${Number(r.shown_cash).toLocaleString("es-CL")}. Para resolver con el efectivo real, entra a Standby con tu código.</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
