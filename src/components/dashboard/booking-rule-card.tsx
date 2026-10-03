"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/premium";

interface State {
  active: boolean; autoTotal: number; newRecommendation: boolean;
  week: { from: string; to: string };
  pros: Array<{ id: string; name: string; target: number; actual: number; count: number }>;
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "short" });

// Cumplimiento semanal de la regla "% por profesional" (solo administrador, solo con esa regla elegida).
export function BookingRuleCard() {
  const [s, setS] = useState<State | null>(null);
  useEffect(() => { fetch("/api/reglas-reserva/estado").then((r) => r.json()).then(setS).catch(() => setS(null)); }, []);
  if (!s?.active) return null;
  return (
    <Panel title="Reservas automáticas" subtitle={`Semana del ${fmt(s.week.from)} al ${fmt(s.week.to)} · ${s.autoTotal} reserva(s) con "Primer profesional disponible"`}>
      {s.newRecommendation && (
        <p className="mb-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          Empezó un mes nuevo: hay una recomendación nueva por estadísticas. <Link href="/dashboard/configuracion" className="font-semibold underline">Revisarla</Link>
        </p>
      )}
      <ul className="space-y-2.5">
        {s.pros.map((p) => (
          <li key={p.id}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-brand-dark">{p.name}</span>
              <span className="tabular-nums text-brand-gray"><b className="text-brand-dark">{p.actual}%</b> / meta {p.target}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.min(100, p.target > 0 ? (p.actual / p.target) * 100 : 0)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
