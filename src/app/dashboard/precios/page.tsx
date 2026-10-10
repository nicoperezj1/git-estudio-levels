"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";

interface PriceChange {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  old_price: number;
  new_price: number;
  created_at: string;
  changed_by_profile: { name: string } | null;
}

export default function PreciosPage() {
  const [history, setHistory] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "service" | "product">("all");

  const fetchData = async () => {
    setLoading(true);
    const params = filter !== "all" ? `?type=${filter}` : "";
    const res = await fetch(`/api/price-history${params}`);
    setHistory(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filter]);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Historial de Precios</h1>
          <p className="text-gray-500 text-sm">Registro de todos los cambios de precios</p>
        </div>
        <a href="/dashboard/barberos/precios"
          className="px-4 py-2 bg-brand-blue text-white text-sm rounded-xl hover:bg-blue-700 font-medium">
          Precios por Profesional
        </a>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "Todos" },
          { key: "service", label: "Servicios" },
          { key: "product", label: "Productos" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        {loading ? <Spinner /> : history.length === 0 ? (
          <p className="p-8 text-center text-gray-400">Sin cambios de precio registrados</p>
        ) : (
          <div className="divide-y">
            {history.map((h) => {
              const increased = Number(h.new_price) > Number(h.old_price);
              const diff = Number(h.new_price) - Number(h.old_price);
              const pct = Math.round((diff / Number(h.old_price)) * 100);

              return (
                <div key={h.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                      increased ? "bg-red-50 text-red-500" : "bg-green-50 text-green-500"
                    }`}>
                      {increased ? "↑" : "↓"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{h.entity_name}</p>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          h.entity_type === "service" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {h.entity_type === "service" ? "Servicio" : "Producto"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(h.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {h.changed_by_profile && ` · por ${h.changed_by_profile.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 line-through">{formatCurrency(Number(h.old_price))}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(Number(h.new_price))}</span>
                    </div>
                    <span className={`text-xs font-medium ${increased ? "text-red-500" : "text-green-500"}`}>
                      {increased ? "+" : ""}{pct}% ({increased ? "+" : ""}{formatCurrency(diff)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
