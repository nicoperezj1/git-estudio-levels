"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  firstVisit: string;
  detail?: string | null;
}

interface MetricsData {
  summary: Array<{ source: string; label: string; count: number; percent: number }>;
  monthly: Array<{ label: string } & Record<string, number>>;
  clientsBySource: Record<string, ClientRow[]>;
}

// Punto 10 (Pablo): "Metricas" en Clientes — diferenciar origen (reserva por link /
// agendado manualmente / desde promociones), visible solo para Administrador y
// Recepcion, para remarketing/seguimiento/reseñas.
//
// Segunda vuelta (26-sep): canales especificos en vez de un generico "Manual" — la
// recepcion siempre pregunta de donde viene el cliente. "manual" se deja mapeado (con
// su propio color) solo para no perder el historial de clientes cargados antes de este
// cambio; ya no se ofrece como opcion nueva en el formulario.
const SOURCE_COLORS: Record<string, { bg: string; text: string; bar: string; dot: string }> = {
  link: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-400", dot: "bg-blue-400" },
  walk_in: { bg: "bg-teal-50", text: "text-teal-700", bar: "bg-teal-400", dot: "bg-teal-400" },
  instagram: { bg: "bg-pink-50", text: "text-pink-700", bar: "bg-pink-400", dot: "bg-pink-400" },
  tiktok: { bg: "bg-slate-50", text: "text-slate-700", bar: "bg-slate-500", dot: "bg-slate-500" },
  facebook: { bg: "bg-indigo-50", text: "text-indigo-700", bar: "bg-indigo-400", dot: "bg-indigo-400" },
  referral: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-400", dot: "bg-amber-400" },
  google_maps: { bg: "bg-green-50", text: "text-green-700", bar: "bg-green-400", dot: "bg-green-400" },
  promotion: { bg: "bg-orange-50", text: "text-orange-700", bar: "bg-orange-400", dot: "bg-orange-400" },
  influencer: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", bar: "bg-fuchsia-400", dot: "bg-fuchsia-400" },
  manual: { bg: "bg-purple-50", text: "text-purple-700", bar: "bg-purple-400", dot: "bg-purple-400" },
  unknown: { bg: "bg-gray-50", text: "text-gray-600", bar: "bg-gray-300", dot: "bg-gray-300" },
};
const SOURCE_KEYS = Object.keys(SOURCE_COLORS);

export default function ClientesMetricasPage() {
  const router = useRouter();
  const { isAtLeast, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAtLeast("receptionist")) {
      router.replace("/dashboard/clientes");
    }
  }, [authLoading, isAtLeast, router]);

  useEffect(() => {
    if (tenantLoading) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (tenant?.id) params.set("tenantId", tenant.id);
    fetch(`/api/clientes/metricas?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (d.summary) setData(d); })
      .finally(() => setLoading(false));
  }, [tenant?.id, tenantLoading]);

  if (authLoading || loading || !data) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const total = data.summary.reduce((s, r) => s + r.count, 0);
  const monthlyTotal = (m: MetricsData["monthly"][number]) =>
    SOURCE_KEYS.reduce((s, k) => s + (m[k] || 0), 0);
  const maxMonthly = Math.max(...data.monthly.map(monthlyTotal), 1);
  const activeList = activeSource ? data.clientsBySource[activeSource] || [] : [];

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/clientes")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Clientes
          </button>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mt-1">Métricas de Clientes</h1>
        <p className="text-sm text-gray-500">Origen de captación: de dónde viene cada cliente, para remarketing y seguimiento</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.summary.map((row) => {
          const colors = SOURCE_COLORS[row.source] || SOURCE_COLORS.unknown;
          return (
            <button
              key={row.source}
              onClick={() => setActiveSource(activeSource === row.source ? null : row.source)}
              className={`text-left rounded-2xl border p-4 transition-all ${colors.bg} ${
                activeSource === row.source ? "border-gray-400 ring-2 ring-gray-300" : "border-gray-100"
              }`}
            >
              <p className={`text-xs font-medium ${colors.text}`}>{row.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{row.count}</p>
              <p className="text-xs text-gray-400">{row.percent}% del total ({total})</p>
            </button>
          );
        })}
      </div>

      {/* Monthly trend */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        <h3 className="font-bold text-gray-800 mb-4">Clientes nuevos por mes (últimos 6 meses)</h3>
        <div className="flex items-end justify-between gap-2 h-48">
          {data.monthly.map((m) => {
            const mTotal = monthlyTotal(m);
            return (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex flex-col-reverse w-full max-w-[36px] h-36 rounded-t overflow-hidden">
                  {SOURCE_KEYS.map((key) =>
                    m[key] > 0 ? (
                      <div
                        key={key}
                        className={SOURCE_COLORS[key].bar}
                        style={{ height: `${(m[key] / maxMonthly) * 100}%` }}
                        title={`${data.summary.find((s) => s.source === key)?.label || key}: ${m[key]}`}
                      />
                    ) : null
                  )}
                </div>
                <span className="text-[10px] text-gray-500">{m.label}</span>
                <span className="text-[10px] font-medium text-gray-700">{mTotal}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 justify-center mt-4 text-xs text-gray-500">
          {data.summary.map((row) => (
            <span key={row.source} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded ${(SOURCE_COLORS[row.source] || SOURCE_COLORS.unknown).dot}`} />
              {row.label}
            </span>
          ))}
        </div>
      </div>

      {/* Client list for the selected source */}
      {activeSource && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-bold text-gray-800">
              Clientes — {data.summary.find((s) => s.source === activeSource)?.label || activeSource}
            </h3>
            <button onClick={() => setActiveSource(null)} className="text-xs text-gray-400 hover:text-gray-600">Cerrar ✕</button>
          </div>
          {activeList.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">Sin clientes en esta categoría</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left p-3 font-medium text-gray-600">Contacto</th>
                  {(activeSource === "promotion" || activeSource === "influencer") && (
                    <th className="text-left p-3 font-medium text-gray-600">{activeSource === "promotion" ? "Código" : "Influencer"}</th>
                  )}
                  <th className="text-right p-3 font-medium text-gray-600">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeList.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/dashboard/clientes/${c.id}`)}
                  >
                    <td className="p-3 font-medium text-gray-800">{c.name}</td>
                    <td className="p-3 text-gray-500">{c.phone || c.email || "—"}</td>
                    {(activeSource === "promotion" || activeSource === "influencer") && (
                      <td className="p-3 text-gray-500">{c.detail || "—"}</td>
                    )}
                    <td className="p-3 text-right text-gray-500">
                      {new Date(`${c.firstVisit}T12:00:00Z`).toLocaleDateString("es-CL")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {!activeSource && (
        <p className="text-xs text-gray-400 text-center">Toca una tarjeta arriba para ver el listado de clientes de esa categoría</p>
      )}
    </div>
  );
}
