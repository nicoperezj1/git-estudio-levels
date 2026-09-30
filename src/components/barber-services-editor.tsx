"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  category?: string | null;
}

export function BarberServicesEditor({ barberId, showToast }: { barberId: string; showToast: (msg: string, type?: "success" | "error" | "info") => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/services?all=true").then((r) => r.json()),
      fetch(`/api/barber-service-assignments?barberId=${barberId}`).then((r) => r.json()),
    ]).then(([svcs, assignedIds]) => {
      const activeServices = Array.isArray(svcs) ? svcs.filter((s: any) => s.active !== false) : [];
      setServices(activeServices);
      // If no assignments saved yet, pre-select ALL (better UX)
      if (!Array.isArray(assignedIds) || assignedIds.length === 0) {
        setAssigned(activeServices.map((s: any) => s.id));
      } else {
        setAssigned(assignedIds);
      }
    });
  }, [barberId]);

  const toggle = (serviceId: string) => {
    if (assigned.includes(serviceId)) {
      setAssigned(assigned.filter((id) => id !== serviceId));
    } else {
      setAssigned([...assigned, serviceId]);
    }
  };

  // Servicios agrupados por categoria (en el orden en que aparecen), "Sin categoria" al final.
  const groups = (() => {
    const order: string[] = [];
    services.forEach((s) => {
      if (s.category && !order.includes(s.category)) order.push(s.category);
    });
    const list = order.map((name) => ({ name, items: services.filter((s) => s.category === name) }));
    const rest = services.filter((s) => !s.category);
    if (rest.length) list.push({ name: "Sin categoria", items: rest });
    return list;
  })();

  const toggleGroup = (items: Service[]) => {
    const ids = items.map((s) => s.id);
    const allOn = ids.every((id) => assigned.includes(id));
    setAssigned(allOn ? assigned.filter((id) => !ids.includes(id)) : Array.from(new Set([...assigned, ...ids])));
  };

  const selectAll = () => setAssigned(services.map((s) => s.id));
  const selectNone = () => setAssigned([]);

  const save = async () => {
    setSaving(true);
    await fetch("/api/barber-service-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId, serviceIds: assigned }),
    });
    setSaving(false);
    showToast("Servicios actualizados", "success");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-brand-gray">{assigned.length}/{services.length} seleccionados</span>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-[10px] text-brand-blue hover:underline">Todos</button>
          <button onClick={selectNone} className="text-[10px] text-brand-gray hover:underline">Ninguno</button>
        </div>
      </div>
      <div className="space-y-4 max-h-80 overflow-y-auto">
        {groups.map((g) => {
          const selectedCount = g.items.filter((s) => assigned.includes(s.id)).length;
          const allOn = selectedCount === g.items.length;
          return (
            <div key={g.name}>
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-brand-light cursor-pointer">
                <input type="checkbox" checked={allOn} onChange={() => toggleGroup(g.items)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                <span className="flex-1 text-xs font-bold uppercase tracking-wide text-brand-dark">{g.name}</span>
                <span className="text-[10px] text-brand-gray">{selectedCount}/{g.items.length}</span>
              </label>
              <div className="mt-1 space-y-1 pl-3">
                {g.items.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-brand-light cursor-pointer">
                    <input type="checkbox" checked={assigned.includes(s.id)} onChange={() => toggle(s.id)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                    <div className="flex-1">
                      <p className="text-sm text-brand-dark font-medium">{s.name}</p>
                      <p className="text-[10px] text-brand-gray">{s.duration} min · {formatCurrency(Number(s.price))}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={save} disabled={saving}
        className="mt-3 px-4 py-2 bg-brand-blue text-white text-sm rounded-xl hover:opacity-90 disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar Servicios"}
      </button>
    </div>
  );
}
