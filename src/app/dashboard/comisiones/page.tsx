"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { ProfessionalLedgerView, useLedgerEnabled } from "@/components/finance/professional-ledger-view";

interface BarberCommission {
  barberId: string;
  barberName: string;
  commissionRate: number;
  totalSales: number;
  commissionAmount: number;
  paidAmount: number;
  pendingAmount: number;
  transactionCount: number;
}

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Con el libro de movimientos encendido (Configuracion) se usa la vista nueva; apagado, esta de siempre.
export default function ComisionesPage() {
  const ledger = useLedgerEnabled();
  if (ledger === null) return <Spinner />;
  return ledger ? <ProfessionalLedgerView mode="commission" /> : <ComisionesLegacy />;
}

function ComisionesLegacy() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [barbers, setBarbers] = useState<BarberCommission[]>([]);
  const [totals, setTotals] = useState({ totalSales: 0, totalCommissions: 0, totalPaid: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [newRate, setNewRate] = useState("");
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ barberId: "", amount: "", type: "addition", reason: "", pin: "" });
  const [adjusting, setAdjusting] = useState(false);
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
    const res = await fetch(`/api/comisiones?month=${month}&year=${year}${t ? `&tenantId=${t}` : ""}`);
    const data = await res.json();
    setBarbers(data.barbers || []);
    setTotals(data.totals || { totalSales: 0, totalCommissions: 0, totalPaid: 0, totalPending: 0 });
    setLoading(false);
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, tenantLoading, tenant?.id]);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const updateRate = async (barberId: string) => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast("Porcentaje invalido (0-100)", "error");
      return;
    }
    await fetch("/api/comisiones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId, commissionRate: rate }),
    });
    showToast("Comision actualizada", "success");
    setEditingRate(null);
    setNewRate("");
    fetchData();
  };

  const markAsPaid = async (barber: BarberCommission) => {
    const ok = await confirm({
      title: "Marcar como pagado",
      message: `Confirmas el pago de ${formatCurrency(barber.pendingAmount)} a ${barber.barberName}?`,
      confirmText: "Si, marcar pagado",
      variant: "warning",
    });
    if (!ok) return;

    await fetch("/api/comisiones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: barber.barberId,
        amount: barber.pendingAmount,
        month,
        year,
      }),
    });
    showToast(`Pago registrado para ${barber.barberName}`, "success");
    fetchData();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Comisiones</h1>
          <p className="text-gray-500 text-sm">Calculo automatico por profesional</p>
        </div>
        <button onClick={() => setShowAdjustModal(true)}
          className="px-4 py-2 bg-orange-600 text-white text-sm rounded-xl hover:bg-orange-700 font-medium">
          Ajuste Manual
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => changeMonth(-1)} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">←</button>
        <span className="text-lg font-bold">{monthNames[month - 1]} {year}</span>
        <button onClick={() => changeMonth(1)} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">→</button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase">Ventas Totales</p>
          <p className="text-xl font-bold">{formatCurrency(totals.totalSales)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase">Comisiones Generadas</p>
          <p className="text-xl font-bold text-purple-600">{formatCurrency(totals.totalCommissions)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase">Pagado</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totals.totalPaid)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-yellow-500">
          <p className="text-xs text-gray-500 uppercase">Pendiente</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totals.totalPending)}</p>
        </div>
      </div>

      {/* Barbers table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Profesional</th>
              <th className="text-center p-4 font-medium text-gray-600">% Comision</th>
              <th className="text-center p-4 font-medium text-gray-600">Ventas</th>
              <th className="text-right p-4 font-medium text-gray-600">Total Vendido</th>
              <th className="text-right p-4 font-medium text-gray-600">Comision</th>
              <th className="text-right p-4 font-medium text-gray-600">Pagado</th>
              <th className="text-right p-4 font-medium text-gray-600">Pendiente</th>
              <th className="text-center p-4 font-medium text-gray-600">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={8}><Spinner /></td></tr>
            ) : barbers.length === 0 ? (
              <tr><td colSpan={8} className="p-4 text-center text-gray-400">No hay datos para este periodo</td></tr>
            ) : barbers.map((b) => (
              <tr key={b.barberId} className="hover:bg-gray-50">
                <td className="p-4 font-medium">{b.barberName}</td>
                <td className="p-4 text-center">
                  {editingRate === b.barberId ? (
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        className="w-16 border rounded px-2 py-1 text-center text-sm"
                        autoFocus
                      />
                      <button onClick={() => updateRate(b.barberId)} className="text-green-600 text-xs font-bold">✓</button>
                      <button onClick={() => setEditingRate(null)} className="text-red-600 text-xs font-bold">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingRate(b.barberId); setNewRate(String(b.commissionRate)); }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {b.commissionRate}%
                    </button>
                  )}
                </td>
                <td className="p-4 text-center text-gray-500">{b.transactionCount}</td>
                <td className="p-4 text-right">{formatCurrency(b.totalSales)}</td>
                <td className="p-4 text-right font-medium text-purple-600">{formatCurrency(b.commissionAmount)}</td>
                <td className="p-4 text-right text-green-600">{formatCurrency(b.paidAmount)}</td>
                <td className="p-4 text-right font-bold text-yellow-600">{formatCurrency(b.pendingAmount)}</td>
                <td className="p-4 text-center">
                  {b.pendingAmount > 0 && (
                    <button
                      onClick={() => markAsPaid(b)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
                    >
                      Pagar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark mb-1">Ajuste Manual de Comision</h3>
            <p className="text-sm text-brand-gray mb-4">Agrega o deduce un monto. Queda registrado en auditoria.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-brand-gray block mb-1">Profesional</label>
                <select value={adjustForm.barberId} onChange={(e) => setAdjustForm({ ...adjustForm, barberId: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="">Seleccionar...</option>
                  {barbers.map((b) => <option key={b.barberId} value={b.barberId}>{b.barberName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-brand-gray block mb-1">Tipo</label>
                  <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="addition">Agregar (+)</option>
                    <option value="deduction">Deducir (-)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-brand-gray block mb-1">Monto ($)</label>
                  <input type="number" min="0" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                    placeholder="10000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-brand-gray block mb-1">Motivo / Justificacion *</label>
                <input type="text" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="Ej: Bono por meta, correccion comision, adelanto..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-brand-gray block mb-1">PIN de administrador</label>
                <input type="password" maxLength={4} value={adjustForm.pin}
                  onChange={(e) => setAdjustForm({ ...adjustForm, pin: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-xl tracking-[0.4em] font-mono" />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={async () => {
                    if (!adjustForm.barberId || !adjustForm.amount || !adjustForm.reason || adjustForm.pin.length !== 4) {
                      showToast("Completa todos los campos", "error"); return;
                    }
                    setAdjusting(true);
                    const res = await fetch("/api/comisiones/adjust", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        barberId: adjustForm.barberId,
                        amount: parseInt(adjustForm.amount),
                        type: adjustForm.type,
                        reason: adjustForm.reason,
                        pin: adjustForm.pin,
                      }),
                    });
                    const data = await res.json();
                    setAdjusting(false);
                    if (res.ok) {
                      showToast(`Ajuste registrado por ${data.adjustedBy}`, "success");
                      setShowAdjustModal(false);
                      setAdjustForm({ barberId: "", amount: "", type: "addition", reason: "", pin: "" });
                      fetchData();
                    } else {
                      showToast(data.error || "Error", "error");
                    }
                  }}
                  disabled={adjusting || !adjustForm.barberId || !adjustForm.amount || !adjustForm.reason || adjustForm.pin.length !== 4}
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                  {adjusting ? "Procesando..." : "Registrar Ajuste"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
