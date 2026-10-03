"use client";

import { useState, useEffect, useRef } from "react";
import { formatCurrency, todayInChile, chileDateOffset } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { TrendingUp, TrendingDown, Wallet, Plus, MoreVertical, ArrowUpRight, ArrowDownRight, CalendarDays } from "lucide-react";
import { PageHeader, StatCard, Panel, Segmented, tableStyles as ts, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

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
  // Fecha contable ("Corresponde al mes", dia 1) y quien registro el movimiento (migracion 090).
  // Vacios en los movimientos de antes: se entiende "el mes de su fecha de creacion" / "sin dato".
  accounting_month?: string | null;
  created_by_name?: string | null;
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
  mixed: "Mixto",
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
  accountingMonth: "", // "" = el mes de hoy
};

// Tabla compacta: celdas mas angostas y texto un punto mas chico para que las 9 columnas entren sin scroll.
const thc = "whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-gray";
const thcR = "whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-gray";
const tdc = "px-3 py-2.5 text-[13px] text-brand-dark";
const tdcR = "px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CL_TZ = "America/Santiago";
// Mes (YYYY-MM) de un instante, en hora de Chile.
const monthOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: CL_TZ, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
const monthLabel = (ym: string) => `${MONTH_NAMES[parseInt(ym.slice(5, 7), 10) - 1]} ${ym.slice(0, 4)}`;
// Hoy y los 14 meses anteriores (para "Corresponde al mes" y el filtro por mes).
const monthOptions = (): Array<{ value: string; label: string }> => {
  const [y, m] = todayInChile().split("-").map(Number);
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value: v, label: monthLabel(v) };
  });
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
  // "" = filtrar por fechas; "YYYY-MM" = solo lo que CORRESPONDE a ese mes (fecha contable).
  const [monthFilter, setMonthFilter] = useState("");
  // Filtros sobre lo que ya esta cargado (""= todos). Los cuadros de arriba y la exportacion usan lo filtrado.
  const [fBarber, setFBarber] = useState("");
  const [fMethod, setFMethod] = useState("");
  const [fAssigned, setFAssigned] = useState("");
  const [fCreator, setFCreator] = useState("");
  const [showFilters, setShowFilters] = useState(false);
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
    if (monthFilter) params.set("month", monthFilter);
    else {
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
    }
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
  }, [filter, dateFrom, dateTo, monthFilter, tenantLoading, tenant?.id]);

  const visible = transactions.filter((t) =>
    (!fBarber || t.barber_id === fBarber) &&
    (!fMethod || t.payment_method === fMethod) &&
    (!fAssigned || (fAssigned === "none" ? !t.assigned_to : t.assigned_to === fAssigned)) &&
    (!fCreator || (fCreator === "none" ? !t.created_by_name : t.created_by_name === fCreator))
  );
  const hasFilters = !!(fBarber || fMethod || fAssigned || fCreator);
  const clearFilters = () => { setFBarber(""); setFMethod(""); setFAssigned(""); setFCreator(""); };
  // Opciones: solo lo que aparece en los movimientos cargados.
  const barberOptions = Array.from(new Map(transactions.filter((t) => t.barber_id && t.barber?.name).map((t) => [t.barber_id as string, t.barber!.name])).entries());
  const methodOptions = Array.from(new Set(transactions.map((t) => t.payment_method)));
  const creatorOptions = Array.from(new Set(transactions.map((t) => t.created_by_name).filter(Boolean))) as string[];

  const totalIncome = visible
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.total), 0);
  const totalExpenses = visible
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.total), 0);
  const balance = totalIncome - totalExpenses;
  const rangeLabel = monthFilter ? monthLabel(monthFilter) : QUICK_RANGES.find((r) => r.key === quickRange)?.label || null;

  const applyQuickRange = (key: string, days: number) => {
    setQuickRange(key);
    setDateFrom(chileDateOffset(-days));
    setDateTo(todayInChile());
  };

  // Descarga lo que se ve en pantalla (mismos filtros) como CSV, que abre directo en Excel.
  const exportCsv = () => {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Hora", "Fecha", "Tipo", "Descripción", "Profesional / Corresponde a", "Emitido por", "Cliente", "Método de pago", "Monto", "Corresponde al mes"];
    const rows = visible.map((t) => {
      const d = new Date(t.created_at);
      return [
        d.toLocaleTimeString("es-CL", { timeZone: CL_TZ, hour: "2-digit", minute: "2-digit" }),
        d.toLocaleDateString("es-CL", { timeZone: CL_TZ }),
        t.type === "income" ? "Ingreso" : "Egreso",
        t.items?.map((i: any) => String(i.description).replace(" (gasto fijo)", "")).join(", ") || t.notes || "",
        t.barber?.name || (t.assigned_to ? assignedToLabels[t.assigned_to] : ""),
        t.created_by_name || "",
        t.client?.name || "",
        paymentMethodLabels[t.payment_method] || t.payment_method,
        (t.type === "expense" ? -1 : 1) * Number(t.total),
        monthLabel((t.accounting_month || "").slice(0, 7) || monthOf(t.created_at)),
      ].map(q).join(";");
    });
    const blob = new Blob(["\uFEFF" + [head.map(q).join(";"), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ingresos-egresos-${monthFilter || `${dateFrom}_${dateTo}`}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
          accountingMonth: formData.accountingMonth || todayInChile().slice(0, 7),
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
      accountingMonth: (t.accounting_month || "").slice(0, 7) || monthOf(t.created_at),
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8 animate-fade-in">
      <PageHeader
        title="Ingresos y egresos"
        subtitle="Todos los movimientos del negocio, en el periodo que elijas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportCsv} disabled={visible.length === 0} className={ghostButton}>
              Exportar a Excel
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData(emptyFormData);
                setShowModal(true);
              }}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Nueva transacción
            </button>
          </div>
        }
      />

      {/* Stat Cards — el rango entre parentesis aclara a que periodo corresponde el
          numero, ya que ahora es elegible (item 38) en vez de fijo. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label={`Ingresos${rangeLabel ? ` · ${rangeLabel}` : ""}`}
          value={formatCurrency(totalIncome)}
          Icon={TrendingUp}
          tone="green"
        />
        <StatCard
          label={`Egresos${rangeLabel ? ` · ${rangeLabel}` : ""}`}
          value={formatCurrency(totalExpenses)}
          Icon={TrendingDown}
          tone="red"
        />
        <StatCard
          hero
          label={`Balance${rangeLabel ? ` · ${rangeLabel}` : ""}`}
          value={formatCurrency(balance)}
          Icon={Wallet}
          hint={balance >= 0 ? "Ingresos menos egresos" : "Egresos superan a los ingresos"}
        />
      </div>

      {/* Una sola fila: tipo, periodo y filtros (plegados). */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: "all", label: "Todos" },
            { value: "income", label: "Ingresos" },
            { value: "expense", label: "Egresos" },
          ]}
        />

        {/* Periodo: un solo selector (rangos rapidos, mes al que corresponde o fechas a mano). */}
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm text-brand-gray">
          <CalendarDays className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
          <select
            value={monthFilter ? `month:${monthFilter}` : quickRange === "custom" ? "custom" : `range:${quickRange}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("month:")) { setMonthFilter(v.slice(6)); return; }
              setMonthFilter("");
              if (v === "custom") { setQuickRange("custom"); return; }
              const r = QUICK_RANGES.find((x) => x.key === v.slice(6));
              if (r) applyQuickRange(r.key, r.days);
            }}
            className="bg-transparent text-sm text-brand-dark outline-none"
          >
            <optgroup label="Período">
              {QUICK_RANGES.map((r) => <option key={r.key} value={`range:${r.key}`}>{r.label}</option>)}
              <option value="custom">Fechas a elegir…</option>
            </optgroup>
            <optgroup label="Corresponde al mes">
              {monthOptions().map((o) => <option key={o.value} value={`month:${o.value}`}>{o.label}</option>)}
            </optgroup>
          </select>
        </div>
        {!monthFilter && quickRange === "custom" && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm text-brand-gray">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-sm text-brand-dark outline-none" />
            <span>→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-sm text-brand-dark outline-none" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${hasFilters ? "border-brand-blue/50 text-brand-blue" : "border-gray-100 bg-white text-brand-gray hover:text-brand-dark"}`}
        >
          Filtros{hasFilters ? ` (${[fBarber, fMethod, fAssigned, fCreator].filter(Boolean).length})` : ""}
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-blue hover:underline">
            Limpiar
          </button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { label: "Profesional", value: fBarber, set: setFBarber, options: barberOptions.map(([id, name]) => ({ value: id, label: name })) },
            { label: "Método de pago", value: fMethod, set: setFMethod, options: methodOptions.map((m) => ({ value: m, label: paymentMethodLabels[m] || m })) },
            { label: "Corresponde a", value: fAssigned, set: setFAssigned, options: [
              { value: "professional", label: assignedToLabels.professional }, { value: "reception", label: assignedToLabels.reception },
              { value: "business", label: assignedToLabels.business }, { value: "none", label: "Sin especificar" },
            ] },
            { label: "Emitido por", value: fCreator, set: setFCreator, options: [...creatorOptions.map((n) => ({ value: n, label: n })), { value: "none", label: "Sin dato" }] },
          ]).map((f) => (
            <div key={f.label}>
              <label className="mb-1 block text-[11px] font-semibold text-brand-gray">{f.label}</label>
              <select value={f.value} onChange={(e) => f.set(e.target.value)} className={`${inputClass} !py-2 text-sm`}>
                <option value="">Todos</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <Panel flush title="Movimientos" subtitle={loading ? undefined : `${visible.length} registro${visible.length === 1 ? "" : "s"}${hasFilters ? ` de ${transactions.length}` : ""}`}>
        <div className={ts.wrap}>
          <table className={ts.table}>
            <thead className={ts.thead}>
              <tr>
                <th className={thc}>Hora</th>
                <th className={thc}>Fecha</th>
                <th className={thc}>Tipo</th>
                <th className={thc}>Descripción</th>
                <th className={thc}>Profesional / Corresponde a</th>
                <th className={thc}>Emitido por</th>
                <th className={thc}>Cliente</th>
                <th className={thc}>Método de pago</th>
                <th className={thcR}>Monto</th>
                {isAdmin && <th className="w-10 px-3 py-3"></th>}
              </tr>
            </thead>
            <tbody className={ts.tbody}>
              {loading ? (
                <tr><td colSpan={isAdmin ? 10 : 9}><Spinner /></td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-5 py-12 text-center text-sm text-brand-gray">
                    No hay transacciones en este periodo
                  </td>
                </tr>
              ) : (
                visible.map((t) => (
                  <tr key={t.id} className={ts.tr}>
                    <td className={`${tdc} whitespace-nowrap tabular-nums text-brand-gray`}>{new Date(t.created_at).toLocaleTimeString("es-CL", { timeZone: CL_TZ, hour: "2-digit", minute: "2-digit" })}</td>
                    <td className={`${tdc} whitespace-nowrap tabular-nums text-brand-gray`}>
                      {new Date(t.created_at).toLocaleDateString("es-CL", { timeZone: CL_TZ })}
                      {/* Si corresponde a otro mes que el de su registro, se avisa (ej. egreso de septiembre cargado en octubre). */}
                      {t.accounting_month && t.accounting_month.slice(0, 7) !== monthOf(t.created_at) && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-amber-600">Corresponde a {monthLabel(t.accounting_month.slice(0, 7))}</span>
                      )}
                    </td>
                    <td className={tdc}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          t.type === "income" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {t.type === "income" ? <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} /> : <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />}
                        {t.type === "income" ? "Ingreso" : "Egreso"}
                      </span>
                    </td>
                    <td className={`${tdc} max-w-[220px] truncate`}>{t.items?.map((i: any) => String(i.description).replace(" (gasto fijo)", "")).join(", ") || t.notes || "-"}</td>
                    <td className={`${tdc} max-w-[130px] truncate`}>{t.barber?.name || (t.assigned_to ? assignedToLabels[t.assigned_to] : "-")}</td>
                    <td className={`${tdc} max-w-[130px] truncate text-brand-gray`} title={t.created_by_name || undefined}>{t.created_by_name || "-"}</td>
                    <td className={`${tdc} max-w-[130px] truncate`}>{t.client?.name || "-"}</td>
                    <td className={tdc}>
                      <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-brand-gray dark:bg-white/10">
                        {paymentMethodLabels[t.payment_method] || t.payment_method}
                      </span>
                    </td>
                    <td className={`${tdcR} whitespace-nowrap ${t.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                      {t.type === "expense" ? "−" : "+"}
                      {formatCurrency(Number(t.total))}
                    </td>
                    {isAdmin && (
                      <td
                        className="relative px-3 py-3 text-right"
                        ref={openMenuId === t.id ? menuRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                          disabled={deletingId === t.id}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-50"
                          aria-label="Mas acciones"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuId === t.id && (
                          <div className="absolute right-4 top-11 z-10 w-36 rounded-xl border border-gray-100 bg-white py-1 text-left shadow-xl">
                            <button
                              type="button"
                              onClick={() => handleEdit(t)}
                              className="w-full px-4 py-2 text-left text-sm text-brand-dark hover:bg-brand-blue/10"
                            >
                              Modificar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t.id)}
                              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
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
      </Panel>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-modal">
          <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl animate-scale-in">
            <h2 className="mb-5 text-lg font-bold tracking-tight text-brand-dark">
              {editingId ? "Modificar transacción" : "Nueva transacción"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 bg-brand-light p-1">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "income" })}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                    formData.type === "income" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "text-brand-gray hover:text-brand-dark"
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} /> Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "expense" })}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                    formData.type === "expense" ? "bg-red-500 text-white shadow-lg shadow-red-500/25" : "text-brand-gray hover:text-brand-dark"
                  }`}
                >
                  <ArrowDownRight className="h-4 w-4" strokeWidth={2.25} /> Egreso
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Descripción</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Monto</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className={`${inputClass} tabular-nums`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Método de pago</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className={inputClass}
                  >
                    <option value="cash">Efectivo</option>
                    <option value="debit_card">Débito</option>
                    <option value="credit_card">Crédito</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Corresponde al mes</label>
                <select
                  value={formData.accountingMonth || todayInChile().slice(0, 7)}
                  onChange={(e) => setFormData({ ...formData, accountingMonth: e.target.value })}
                  className={inputClass}
                >
                  {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-brand-gray">Define en qué cierre mensual e informe cuenta este movimiento, aunque lo registres después.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={inputClass}
                  rows={2}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Corresponde a</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      assignedTo: e.target.value as typeof formData.assignedTo,
                      barberId: e.target.value === "professional" ? formData.barberId : "",
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Sin especificar</option>
                  <option value="professional">Profesional</option>
                  <option value="reception">Recepción</option>
                  <option value="business">Negocio general</option>
                </select>
              </div>
              {formData.assignedTo === "professional" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Profesional</label>
                  <select
                    value={formData.barberId}
                    onChange={(e) => setFormData({ ...formData, barberId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Sin especificar</option>
                    {barbers.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className={ghostButton}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!formData.description || !formData.amount || parseFloat(formData.amount) <= 0}
                  className={primaryButton}
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
