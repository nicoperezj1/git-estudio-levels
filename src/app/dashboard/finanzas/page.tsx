"use client";

import { useState, useEffect, useRef } from "react";
import { formatCurrency, todayInChile, chileDateOffset } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface Transaction {
  id: string;
  type: "income" | "expense";
  total: number;
  payment_method: string;
  notes: string;
  created_at: string;
  client: { name: string } | null;
  barber: { name: string } | null;
  items: Array<{ description: string; total: number }>;
  assigned_to: "professional" | "reception" | "business" | null;
  barber_id: string | null;
}

interface Barber {
  id: string;
  name: string;
}

const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Debito",
  credit_card: "Credito",
  transfer: "Transferencia",
};

// Punto 5 (Pablo): "a quien corresponde" el movimiento, para saber donde repercute.
const assignedToLabels: Record<string, string> = {
  professional: "Profesional",
  reception: "Recepcion",
  business: "Negocio general",
};

// Item 38 (Nico, 26-sep): selector de rango para el valor mostrado (antes solo se podia
// elegir fecha a mano, sin atajos, y en la practica se veia "el mes" porque el limite de
// 1000 filas mas recientes solia cubrir mas o menos eso). Mismos rangos que se manejan en
// otras pantallas del sistema (Dashboard, Billetera), en dias hacia atras desde hoy.
const QUICK_RANGES = [
  { key: "today", label: "Hoy", days: 0 },
  { key: "week", label: "Semana", days: 7 },
  { key: "month", label: "Mes", days: 30 },
  { key: "3m", label: "3 meses", days: 90 },
  { key: "6m", label: "6 meses", days: 180 },
  { key: "1y", label: "1 año", days: 365 },
] as const;

const emptyFormData = {
  type: "income" as "income" | "expense",
  description: "",
  amount: "",
  paymentMethod: "cash",
  notes: "",
  assignedTo: "" as "" | "professional" | "reception" | "business",
  barberId: "",
};

export default function FinanzasPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  // Default a "Mes" (item 38): es lo mas parecido a lo que se veia antes por el limite de
  // filas, pero ahora es explicito y se puede cambiar con un clic en vez de tener que
  // adivinar/escribir fechas a mano.
  const [quickRange, setQuickRange] = useState<string>("month");
  const [dateFrom, setDateFrom] = useState(() => chileDateOffset(-30));
  const [dateTo, setDateTo] = useState(() => todayInChile());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // Punto 5: null = creando una transaccion nueva; con id = editando una existente
  // ("Modificar" desde el menu de tres puntos).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const { isAtLeast } = useAuth();
  // Punto 5: "solo para el administrador" — gate en la UI (el servidor tambien lo
  // exige en PATCH/DELETE, asi que ocultar el menu no es la unica barrera).
  const isAdmin = isAtLeast("admin");
  const menuRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchTransactions = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("type", filter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const t = getActiveTenantId();
    if (t) params.set("tenantId", t);
    try {
      const res = await fetch(`/api/finanzas?${params.toString()}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setBarbers(data.barbers || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFrom, dateTo, tenantLoading, tenant?.id]);

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.total), 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.total), 0);
  const balance = totalIncome - totalExpenses;
  const rangeLabel = QUICK_RANGES.find((r) => r.key === quickRange)?.label || null;

  const applyQuickRange = (key: string, days: number) => {
    setQuickRange(key);
    setDateFrom(chileDateOffset(-days));
    setDateTo(todayInChile());
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(emptyFormData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = !!editingId;
    try {
      const res = await fetch(isEditing ? `/api/finanzas/${editingId}` : "/api/finanzas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.type,
          description: formData.description,
          amount: parseFloat(formData.amount),
          paymentMethod: formData.paymentMethod,
          notes: formData.notes,
          assignedTo: formData.assignedTo || null,
          barberId: formData.assignedTo === "professional" ? formData.barberId || null : null,
          tenantId: getActiveTenantId() || undefined,
        }),
      });
      // fetch() only rejects on a network failure, never on a non-2xx response, so a
      // rejected/failed insert (e.g. "No se pudo determinar el negocio") was silently
      // reported as success ("Transaccion registrada") while nothing was actually saved.
      // That's exactly how manual egresos went "missing" — the toast lied. Must check
      // res.ok and surface the real server error instead of assuming success.
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `No se pudo ${isEditing ? "modificar" : "registrar"} la transaccion`, "error");
        return;
      }
      showToast(isEditing ? "Transaccion actualizada" : "Transaccion registrada", "success");
      closeModal();
      fetchTransactions();
    } catch (err) {
      console.error("Error saving transaction:", err);
      showToast(`Error al ${isEditing ? "modificar" : "registrar"} transaccion`, "error");
    }
  };

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id);
    setFormData({
      type: t.type,
      description: t.items?.[0]?.description || t.notes || "",
      amount: String(Number(t.total)),
      paymentMethod: t.payment_method,
      notes: t.notes || "",
      assignedTo: t.assigned_to || "",
      barberId: t.barber_id || "",
    });
    setOpenMenuId(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    setOpenMenuId(null);
    if (!confirm("Eliminar este movimiento? Esta accion se puede revertir solo desde la base de datos.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/finanzas/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "No se pudo eliminar el movimiento", "error");
        return;
      }
      showToast("Movimiento eliminado", "success");
      fetchTransactions();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      showToast("Error al eliminar movimiento", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Finanzas</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData(emptyFormData);
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          Nueva Transaccion
        </button>
      </div>

      {/* Stat Cards — el rango entre parentesis aclara a que periodo corresponde el
          numero, ya que ahora es elegible (item 38) en vez de fijo. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Total Ingresos {rangeLabel && `(${rangeLabel})`}</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Total Egresos {rangeLabel && `(${rangeLabel})`}</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">Balance {rangeLabel && `(${rangeLabel})`}</p>
          <p className="text-2xl font-bold text-indigo-600">{formatCurrency(balance)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          {[
            { key: "all", label: "Todos" },
            { key: "income", label: "Ingresos" },
            { key: "expense", label: "Egresos" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as "all" | "income" | "expense")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                filter === f.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Item 38: atajos de rango en vez de tener que escribir fechas a mano cada vez. */}
        <div className="flex gap-2 flex-wrap">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => applyQuickRange(r.key, r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                quickRange === r.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setQuickRange("custom"); setDateFrom(e.target.value); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-gray-500">a</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setQuickRange("custom"); setDateTo(e.target.value); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Fecha</th>
              <th className="text-left p-4 font-medium text-gray-600">Tipo</th>
              <th className="text-left p-4 font-medium text-gray-600">Descripcion</th>
              <th className="text-left p-4 font-medium text-gray-600">Cliente/Profesional</th>
              <th className="text-left p-4 font-medium text-gray-600">Corresponde a</th>
              <th className="text-left p-4 font-medium text-gray-600">Metodo</th>
              <th className="text-right p-4 font-medium text-gray-600">Monto</th>
              {isAdmin && <th className="p-4 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={isAdmin ? 8 : 7}><Spinner /></td></tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="p-4 text-center text-gray-500">
                  No hay transacciones
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="p-4">{new Date(t.created_at).toLocaleDateString("es-CL")}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        t.type === "income"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t.type === "income" ? "Ingreso" : "Egreso"}
                    </span>
                  </td>
                  <td className="p-4">{t.items?.map((i: any) => i.description).join(", ") || t.notes || "-"}</td>
                  <td className="p-4">{t.client?.name || t.barber?.name || "-"}</td>
                  <td className="p-4 text-gray-500">{t.assigned_to ? assignedToLabels[t.assigned_to] : "-"}</td>
                  <td className="p-4">{paymentMethodLabels[t.payment_method] || t.payment_method}</td>
                  <td className={`p-4 text-right font-medium ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {t.type === "expense" ? "-" : ""}
                    {formatCurrency(Number(t.total))}
                  </td>
                  {isAdmin && (
                    <td
                      className="p-4 text-right relative"
                      ref={openMenuId === t.id ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                        disabled={deletingId === t.id}
                        className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-50"
                        aria-label="Mas acciones"
                      >
                        ⋮
                      </button>
                      {openMenuId === t.id && (
                        <div
                          className="absolute right-4 top-10 z-10 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-36 text-left"
                        >
                          <button
                            type="button"
                            onClick={() => handleEdit(t)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Modificar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">{editingId ? "Modificar Transaccion" : "Nueva Transaccion"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "income" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    formData.type === "income"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "expense" })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    formData.type === "expense"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Egreso
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metodo de Pago</label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="cash">Efectivo</option>
                  <option value="debit_card">Debito</option>
                  <option value="credit_card">Credito</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Corresponde a</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      assignedTo: e.target.value as typeof formData.assignedTo,
                      barberId: e.target.value === "professional" ? formData.barberId : "",
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Sin especificar</option>
                  <option value="professional">Profesional</option>
                  <option value="reception">Recepcion</option>
                  <option value="business">Negocio general</option>
                </select>
              </div>
              {formData.assignedTo === "professional" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
                  <select
                    value={formData.barberId}
                    onChange={(e) => setFormData({ ...formData, barberId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Sin especificar</option>
                    {barbers.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!formData.description || !formData.amount || parseFloat(formData.amount) <= 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingId ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
