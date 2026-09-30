"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/premium";

// "Cumpleanos del mes" del Dashboard (Nico, 29-sep): quien del equipo cumple anos este mes,
// segun la fecha de nacimiento cargada en Profesionales. Solo se monta para administradores.

interface Birthday {
  id: string;
  name: string;
  avatar_url: string | null;
  day: number;
  month: number;
  age: number;
  isToday: boolean;
  daysUntil: number | null;
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function BirthdaysCard({ tenantId }: { tenantId?: string }) {
  const [items, setItems] = useState<Birthday[] | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    const qs = tenantId ? `?tenantId=${tenantId}` : "";
    fetch(`/api/team/birthdays${qs}`)
      .then((r) => (r.ok ? r.json() : { month: null, birthdays: [] }))
      .then((d) => {
        setItems(Array.isArray(d.birthdays) ? d.birthdays : []);
        setMonth(d.month ?? null);
      })
      .catch(() => setItems([]));
  }, [tenantId]);

  const monthName = month ? MONTHS[month - 1] : "";

  const when = (b: Birthday) => {
    if (b.isToday) return { label: "¡Hoy!", cls: "bg-brand-blue text-white shadow-md shadow-brand-blue/30" };
    if (b.daysUntil === null) return { label: `${b.day} de ${monthName}`, cls: "bg-black/5 text-brand-gray dark:bg-white/10" };
    if (b.daysUntil > 0) return { label: b.daysUntil === 1 ? "Mañana" : `En ${b.daysUntil} días`, cls: "bg-amber-500/15 text-amber-500" };
    return { label: "Ya pasó", cls: "bg-black/5 text-brand-gray dark:bg-white/10" };
  };

  // Sin cumpleaneros este mes (o mientras carga / si falla): no se muestra la seccion.
  if (items === null || items.length === 0) return null;

  return (
    <Panel
      title="Cumpleaños del mes"
      subtitle={monthName ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : undefined}
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((b) => {
          const w = when(b);
          const initials = b.name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");
          return (
            <li
              key={b.id}
              className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                b.isToday ? "border-brand-blue/40 bg-brand-blue/[0.07]" : "border-transparent hover:border-brand-blue/20 hover:bg-brand-blue/[0.04]"
              }`}
            >
              {b.avatar_url ? (
                <img src={b.avatar_url} alt={b.name} className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-2 ring-brand-blue/20" />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue/25 to-brand-accent/10 text-sm font-bold text-brand-blue ring-1 ring-brand-blue/20">
                  {initials || "•"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-dark">
                  {b.name} {b.isToday && "🎂"}
                </p>
                <p className="text-[11px] text-brand-gray">
                  {b.day} de {monthName}
                  {b.age > 0 && b.age < 100 ? ` · cumple ${b.age}` : ""}
                </p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${w.cls}`}>{w.label}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
