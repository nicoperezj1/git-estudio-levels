"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";

interface Reward {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  discount_value: number;
  active: boolean;
}

interface TopClient {
  id: string;
  name: string;
  loyalty_points: number;
}

interface ClientLookup {
  id: string;
  name: string;
  loyalty_points: number;
  history: Array<{ points: number; reason: string; created_at: string }>;
}

export default function FidelidadPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [config, setConfig] = useState({ points_per_clp: 1000 });
  const [ppcInput, setPpcInput] = useState("1000");
  const [savingPpc, setSavingPpc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchClient, setSearchClient] = useState("");
  const [clientData, setClientData] = useState<ClientLookup | null>(null);
  const [selectedReward, setSelectedReward] = useState("");
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchData = async () => {
    setLoading(true);
    const t = getActiveTenantId();
    const res = await fetch(`/api/loyalty${t ? `?tenantId=${t}` : ""}`);
    const data = await res.json();
    setRewards(data.rewards || []);
    setTopClients(data.topClients || []);
    setConfig(data.config || { points_per_clp: 1000 });
    setPpcInput(String((data.config || { points_per_clp: 1000 }).points_per_clp));
    setLoading(false);
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const savePointsPerClp = async () => {
    const t = getActiveTenantId();
    setSavingPpc(true);
    try {
      const res = await fetch(`/api/loyalty${t ? `?tenantId=${t}` : ""}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points_per_clp: Number(ppcInput) }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "No se pudo guardar", "error");
      } else {
        setConfig({ points_per_clp: data.points_per_clp });
        setPpcInput(String(data.points_per_clp));
        showToast("Puntos por compra actualizados", "success");
      }
    } finally {
      setSavingPpc(false);
    }
  };

  const lookupClient = async () => {
    if (!searchClient) return;
    const t = getActiveTenantId();
    // Search by name in clients (scoped to this business)
    const res = await fetch(`/api/clients?search=${encodeURIComponent(searchClient)}${t ? `&tenantId=${t}` : ""}`);
    const data = await res.json();
    const clients = data.clients || data || [];
    if (clients.length > 0) {
      const clientId = clients[0].id;
      const loyaltyRes = await fetch(`/api/loyalty?clientId=${clientId}${t ? `&tenantId=${t}` : ""}`);
      const loyaltyData = await loyaltyRes.json();
      setClientData(loyaltyData.client);
    } else {
      showToast("Cliente no encontrado", "error");
    }
  };

  const redeemReward = async () => {
    if (!clientData || !selectedReward) return;

    const reward = rewards.find((r) => r.id === selectedReward);
    if (!reward) return;

    const ok = await confirm({
      title: "Canjear puntos",
      message: `${clientData.name} canjea ${reward.points_required} puntos por "${reward.name}"?`,
      confirmText: "Canjear",
      variant: "warning",
    });
    if (!ok) return;

    const res = await fetch("/api/loyalty/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientData.id, rewardId: selectedReward }),
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Canjeado! Cupon: ${data.couponCode}`, "success");
      setClientData({ ...clientData, loyalty_points: data.newBalance });
      setSelectedReward("");
    } else {
      showToast(data.error || "Error al canjear", "error");
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Programa de Fidelidad</h1>
        <p className="text-gray-500 text-sm">1 punto por cada ${config.points_per_clp.toLocaleString("es-CL")} gastados</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
        <h3 className="font-bold text-gray-800 mb-1">Puntos por compra</h3>
        <p className="text-xs text-gray-500 mb-3">Cuánto debe gastar el cliente para ganar 1 punto. Cada negocio elige el suyo; aplica a las ventas nuevas.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">1 punto por cada $</span>
          <input type="number" min={1} step={1} value={ppcInput} onChange={(e) => setPpcInput(e.target.value)}
            className="w-28 border rounded-lg px-3 py-2 text-sm" />
          <button onClick={savePointsPerClp}
            disabled={savingPpc || !ppcInput || Number(ppcInput) === config.points_per_clp}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
            {savingPpc ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client lookup & redeem */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <h3 className="font-bold text-gray-800 mb-3">Consultar Puntos</h3>
            <div className="flex gap-2">
              <input type="text" value={searchClient} onChange={(e) => setSearchClient(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupClient()}
                placeholder="Nombre del cliente..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={lookupClient}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                Buscar
              </button>
            </div>

            {clientData && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-lg">{clientData.name}</p>
                    <p className="text-sm text-gray-500">Balance actual</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-indigo-600">{clientData.loyalty_points}</p>
                    <p className="text-xs text-gray-400">puntos</p>
                  </div>
                </div>

                {/* Redeem */}
                <div className="flex gap-2 mt-3">
                  <select value={selectedReward} onChange={(e) => setSelectedReward(e.target.value)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm">
                    <option value="">Canjear recompensa...</option>
                    {rewards.map((r) => (
                      <option key={r.id} value={r.id} disabled={clientData.loyalty_points < r.points_required}>
                        {r.name} ({r.points_required} pts) {clientData.loyalty_points < r.points_required ? "- insuficiente" : ""}
                      </option>
                    ))}
                  </select>
                  <button onClick={redeemReward}
                    disabled={!selectedReward}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                    Canjear
                  </button>
                </div>

                {/* History */}
                {clientData.history.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 uppercase mb-2">Historial</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {clientData.history.map((h, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-600">
                            {h.reason === "purchase" ? "Compra" : h.reason === "redeem" ? "Canje" : h.reason === "bonus" ? "Bonus" : h.reason}
                          </span>
                          <span className={h.points > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {h.points > 0 ? "+" : ""}{h.points} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rewards config */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">Recompensas Disponibles</h3>
              <button onClick={async () => {
                const name = prompt("Nombre de la recompensa (ej: Corte gratis)");
                if (!name) return;
                const points = prompt("Puntos requeridos");
                if (!points) return;
                const discount = prompt("Valor del descuento ($)");
                await fetch("/api/loyalty/rewards", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, points_required: parseInt(points), discount_value: parseInt(discount || "0"), description: name, tenantId: getActiveTenantId() || undefined }),
                });
                showToast("Recompensa creada", "success");
                fetchData();
              }} className="text-xs px-3 py-1 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90">
                + Agregar
              </button>
            </div>
            <div className="space-y-2">
              {rewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.description} · Descuento: {formatCurrency(Number(r.discount_value))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold">
                      {r.points_required} pts
                    </span>
                    <button onClick={async () => {
                      const ok = await confirm({ title: "Eliminar recompensa", message: `Eliminar "${r.name}"?`, confirmText: "Eliminar", variant: "warning" });
                      if (!ok) return;
                      await fetch(`/api/loyalty/rewards?id=${r.id}`, { method: "DELETE" });
                      showToast("Recompensa eliminada", "success");
                      fetchData();
                    }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                </div>
              ))}
              {rewards.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No hay recompensas configuradas</p>}
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <h3 className="font-bold text-gray-800 mb-3">Condiciones del Programa</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-1 rounded" disabled />
                <span>Los puntos se acumulan automaticamente al pagar en el POS</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-1 rounded" disabled />
                <span>Los puntos solo se pueden canjear en la sucursal donde te atiendes</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-1 rounded" disabled />
                <span>Los puntos se reinician automaticamente en diciembre de cada año</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-1 rounded" disabled />
                <span>Las recompensas no son acumulables con otros descuentos</span>
              </label>
            </div>
            <p className="text-[10px] text-brand-gray mt-3">Estas condiciones se muestran al cliente en su portal y en los emails de fidelidad.</p>
          </div>
        </div>

        {/* Top clients leaderboard */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h3 className="font-bold text-gray-800 mb-3">Top Clientes Fieles</h3>
          {topClients.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Sin datos aun</p>
          ) : (
            <div className="space-y-2">
              {topClients.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? "bg-yellow-100 text-yellow-700" :
                    i === 1 ? "bg-gray-100 text-gray-600" :
                    i === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-gray-50 text-gray-400"
                  }`}>{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  </div>
                  <span className="text-sm font-bold text-indigo-600">{c.loyalty_points} pts</span>
                </div>
              ))}
            </div>
          )}

          {/* Info */}
          <div className="mt-6 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Como funciona:</strong> Los puntos se suman automaticamente al cobrar en el POS.
              El cliente puede canjear en su proxima visita.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
