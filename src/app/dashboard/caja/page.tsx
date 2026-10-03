"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { ReceptionistGreeting } from "@/components/ui/receptionist-greeting";
import { useCajaLockEnabled } from "@/components/caja/caja-lock";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency, todayInChile, dateStrOffset } from "@/lib/utils";

interface CajaData {
  register: any;
  isOpen: boolean;
  summary: {
    openingAmount: number;
    cashIncome: number;
    cashExpense: number;
    cardIncome: number;
    totalIncome: number;
    totalExpense: number;
    expectedCash: number;
    rentalCashToBarber?: number;
    withdrawalsTotal?: number;
    adjustmentsTotal?: number;
    cashCap?: number | null;
    transactionCount: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    total: number;
    payment_method: string;
    notes: string | null;
    created_at: string;
    tip_amount?: number;
    barber_id?: string | null;
    barberName?: string | null;
    services?: string;
    issuedByName?: string | null;
    origin?: string | null;
    cashAmount?: number;
    barberTakesCash?: boolean;
  }>;
  withdrawals?: Array<{ id: string; amount: number; note: string | null; created_by_name: string | null; created_at: string }>;
  adjustments?: Array<{ id: string; amount: number; note: string; created_by_name: string | null; created_at: string; declared_cash: number | null }>;
}

const paymentLabels: Record<string, string> = {
  cash: "Efectivo", debit_card: "Debito", credit_card: "Credito", transfer: "Transfer",
};

export default function CajaPage() {
  const [data, setData] = useState<CajaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();
  const { isAtLeast } = useAuth();
  // Solo Administrador (o super_admin) se salta el PIN de las acciones de modificar/
  // eliminar un movimiento; Recepcion (unico otro rol con acceso a Caja) siempre lo pide.
  const isAdmin = isAtLeast("admin");
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenPin, setReopenPin] = useState("");
  const [reopenError, setReopenError] = useState("");
  const [reopening, setReopening] = useState(false);

  // Filter the daily movements by professional.
  const [barberFilter, setBarberFilter] = useState<string>("all");
  // Origen del movimiento (Standby / Punto de venta / Retiros y ajustes): para saber de donde viene cada uno al cuadrar.
  const [originFilter, setOriginFilter] = useState<string>("all");
  // Orden por hora: "asc" = del primero al ultimo (el efectivo acumulado se lee de arriba hacia abajo), "desc" = lo mas reciente arriba.
  const [timeOrder, setTimeOrder] = useState<"asc" | "desc">("asc");

  // Ver dias anteriores (Punto Nico, 25-sep), solo Administrador: la caja de "hoy" sigue
  // siendo lo unico que se puede abrir/cerrar/reabrir, pero se puede consultar el historial
  // de movimientos y el resumen de cualquier dia pasado, igual que el selector de fecha del
  // Dashboard (Punto 8).
  const [selectedDate, setSelectedDate] = useState(todayInChile());
  const isToday = selectedDate === todayInChile();

  // Manual movement (register a sale by hand when a card charge went through but
  // re-booking didn't record it). Gated by admin PIN.
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ barberId: "", serviceName: "", amount: "", paymentMethod: "debit_card", tip: "", notes: "", pin: "" });
  const [manualSaving, setManualSaving] = useState(false);
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string }>>([]);

  // Modificar/eliminar movimientos (Punto Nico, 25-sep). Menu de tres puntos por fila.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLTableCellElement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Portón de PIN (solo Recepcion): antes de editar o eliminar, guarda que accion quedo
  // pendiente y para que movimiento, hasta que se valide el PIN de un administrador.
  const [pinGate, setPinGate] = useState<{ action: "edit" | "delete"; tx: any } | null>(null);
  const [gatePin, setGatePin] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateVerifying, setGateVerifying] = useState(false);

  // Modal de edicion. editPin guarda el PIN ya validado (solo Recepcion) para reenviarlo
  // junto con el PATCH, que lo vuelve a verificar en el servidor.
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ barberId: "", serviceName: "", amount: "", paymentMethod: "cash", tip: "" });
  const [editPin, setEditPin] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Apagar caja (Fase 5): oculta montos y acciones; se enciende con el PIN de la recepcionista. Es
  // distinto de cerrar la caja del dia. El bloqueo vive en este navegador.
  const lockKey = `caja_off_${tenant?.id || "x"}`;
  const lockEnabled = useCajaLockEnabled(); // solo si el administrador lo activo en Configuracion
  const [lockReady, setLockReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  useEffect(() => {
    if (tenantLoading) return;
    try { setLocked(localStorage.getItem(lockKey) === "1"); } catch {}
    setLockReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);
  const lockCaja = () => { try { localStorage.setItem(lockKey, "1"); } catch {} setLocked(true); setUnlockPin(""); setUnlockError(""); };
  const unlockCaja = async () => {
    if (unlockPin.length !== 4 || unlocking) return;
    setUnlocking(true); setUnlockError("");
    try {
      const res = await fetch("/api/caja/desbloquear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: unlockPin }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.valid) { setUnlockError(d.error || "PIN incorrecto"); return; }
      try { localStorage.removeItem(lockKey); } catch {}
      setLocked(false); setUnlockPin("");
    } finally { setUnlocking(false); }
  };

  // Descuento por planilla: recepcion o el administrador ingresa el codigo que genero el profesional.
  const [planillaCode, setPlanillaCode] = useState("");
  const [planillaBusy, setPlanillaBusy] = useState(false);
  const [planillaPending, setPlanillaPending] = useState<Array<{ id: string; barber_name: string; product_name: string; quantity: number; total: number; over_limit: boolean }>>([]);
  const loadPlanilla = () => { fetch("/api/planilla").then((r) => r.json()).then((d) => setPlanillaPending(d?.pending || [])).catch(() => {}); };
  const approvePlanilla = async (confirmOver = false) => {
    const code = planillaCode.trim().toUpperCase();
    if (code.length !== 6 || planillaBusy) return;
    setPlanillaBusy(true);
    try {
      const res = await fetch("/api/planilla/aprobar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, confirmOver }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.needsConfirm) {
        setPlanillaBusy(false);
        const ok = await confirm({ title: "Supera el 15%", message: d.message, confirmText: "Confirmar igual", variant: "warning" });
        if (ok) await approvePlanilla(true);
        return;
      }
      if (!res.ok) throw new Error(d.error || "No se pudo aprobar");
      showToast(`Descuento por planilla aprobado (${formatCurrency(d.total)})`, "success");
      if (d.movementSaved === false) showToast(`El stock bajó, pero no se pudo anotar el movimiento de inventario: ${d.movementError || "error"}`, "error");
      if (d.ledgerSaved === false) showToast(`No se pudo anotar en el libro del profesional: ${d.ledgerError || "error"}`, "error");
      setPlanillaCode(""); loadPlanilla();
    } catch (e: any) {
      showToast(e?.message || "No se pudo aprobar", "error");
    } finally { setPlanillaBusy(false); }
  };
  const rejectPlanilla = async (id: string) => {
    const res = await fetch("/api/planilla", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { showToast("Descuento rechazado", "success"); loadPlanilla(); }
  };
  useEffect(() => { if (!tenantLoading) loadPlanilla(); }, [tenantLoading, tenant?.id]);

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
    const params = new URLSearchParams({ date: selectedDate });
    if (t) params.set("tenantId", t);
    const res = await fetch(`/api/caja?${params.toString()}`);
    setData(await res.json());
    setLoading(false);
  };

  const handleReopen = async () => {
    setReopenError("");
    if (reopenPin.length !== 4) { setReopenError("PIN de 4 digitos"); return; }
    setReopening(true);

    // Verify admin PIN
    const pinRes = await fetch("/api/pos/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: reopenPin }),
    });
    const pinData = await pinRes.json();

    if (!pinData.valid) {
      setReopenError("PIN incorrecto");
      setReopening(false);
      return;
    }

    // Reopen the register
    const res = await fetch("/api/caja/reopen", { method: "POST" });
    setReopening(false);

    if (res.ok) {
      showToast(`Caja reabierta por ${pinData.adminName}`, "success");
      setShowReopenModal(false);
      setReopenPin("");
      fetchData();
    } else {
      const err = await res.json();
      setReopenError(err.error || "Error al reabrir");
    }
  };

  // Cierra el menu de tres puntos al hacer click fuera de el.
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  const openEditModal = (tx: any, pin: string) => {
    setEditingTx(tx);
    setEditPin(pin);
    setEditForm({
      barberId: tx.barber_id || "",
      serviceName: tx.services || tx.notes || "",
      amount: tx.total != null ? String(tx.total) : "",
      paymentMethod: tx.payment_method || "cash",
      tip: tx.tip_amount ? String(tx.tip_amount) : "",
    });
  };

  const doDelete = async (id: string, pin: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/caja/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin || undefined }),
    });
    setDeletingId(null);
    if (res.ok) {
      showToast("Movimiento eliminado", "success");
      fetchData();
    } else {
      const err = await res.json().catch(() => ({} as any));
      showToast(err.error || "No se pudo eliminar", "error");
    }
  };

  const handleMenuEdit = (tx: any) => {
    setOpenMenuId(null);
    if (isAdmin) {
      openEditModal(tx, "");
    } else {
      setGatePin("");
      setGateError("");
      setPinGate({ action: "edit", tx });
    }
  };

  const handleMenuDelete = async (tx: any) => {
    setOpenMenuId(null);
    if (isAdmin) {
      // Administrador no necesita PIN, pero se le pide doble confirmacion para evitar
      // errores (dos pasos distintos, no el mismo dialogo repetido).
      const ok1 = await confirm({
        title: "Eliminar movimiento",
        message: `Eliminar el movimiento de ${formatCurrency(Number(tx.total))} (${tx.barberName || "sin profesional"})?`,
        confirmText: "Eliminar",
        variant: "danger",
      });
      if (!ok1) return;
      const ok2 = await confirm({
        title: "Confirmar eliminacion",
        message: "Esta accion no se puede deshacer desde aqui. Confirmas definitivamente?",
        confirmText: "Si, eliminar",
        variant: "danger",
      });
      if (!ok2) return;
      await doDelete(tx.id, "");
    } else {
      setGatePin("");
      setGateError("");
      setPinGate({ action: "delete", tx });
    }
  };

  const handleGateSubmit = async () => {
    if (!pinGate) return;
    setGateError("");
    if (gatePin.length !== 4) { setGateError("PIN de 4 digitos"); return; }
    setGateVerifying(true);
    const res = await fetch("/api/pos/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: gatePin }),
    });
    const data = await res.json();
    setGateVerifying(false);
    if (!data.valid) { setGateError("PIN incorrecto"); return; }

    const { action, tx } = pinGate;
    setPinGate(null);
    if (action === "edit") {
      openEditModal(tx, gatePin);
    } else {
      await doDelete(tx.id, gatePin);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    if (!editForm.serviceName.trim() || !editForm.amount) {
      showToast("Completa servicio y precio", "error");
      return;
    }
    if (isAdmin) {
      const ok1 = await confirm({
        title: "Guardar cambios",
        message: "Guardar los cambios de este movimiento?",
        confirmText: "Guardar",
        variant: "warning",
      });
      if (!ok1) return;
      const ok2 = await confirm({
        title: "Confirmar cambios",
        message: "Confirmas definitivamente estos cambios?",
        confirmText: "Si, guardar",
        variant: "warning",
      });
      if (!ok2) return;
    }
    setSavingEdit(true);
    const res = await fetch(`/api/caja/${editingTx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: editForm.barberId || null,
        serviceName: editForm.serviceName,
        amount: editForm.amount,
        paymentMethod: editForm.paymentMethod,
        tip: editForm.tip || 0,
        pin: isAdmin ? undefined : editPin,
      }),
    });
    setSavingEdit(false);
    if (res.ok) {
      showToast("Movimiento actualizado", "success");
      setEditingTx(null);
      fetchData();
    } else {
      const err = await res.json().catch(() => ({} as any));
      showToast(err.error || "No se pudo guardar", "error");
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchData();
    const t = getActiveTenantId();
    fetch(`/api/barberos${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json())
      .then((d) => setBarbers(Array.isArray(d) ? d : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id, selectedDate]);

  const submitManualMovement = async () => {
    if (!manualForm.serviceName.trim() || !manualForm.amount || manualForm.pin.length < 4) {
      showToast("Completa servicio, monto y PIN", "error");
      return;
    }
    setManualSaving(true);
    const res = await fetch("/api/caja/manual-movement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: getActiveTenantId(),
        barberId: manualForm.barberId || null,
        serviceName: manualForm.serviceName,
        amount: manualForm.amount,
        paymentMethod: manualForm.paymentMethod,
        tip: manualForm.tip,
        notes: manualForm.notes,
        pin: manualForm.pin,
      }),
    });
    const data = await res.json();
    setManualSaving(false);
    if (res.ok) {
      showToast("Movimiento registrado", "success");
      setShowManualModal(false);
      setManualForm({ barberId: "", serviceName: "", amount: "", paymentMethod: "debit_card", tip: "", notes: "", pin: "" });
      fetchData();
    } else {
      showToast(data.error || "No se pudo registrar", "error");
    }
  };

  const openRegister = async () => {
    const res = await fetch("/api/caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingAmount: parseInt(openingAmount) || 0, tenantId: getActiveTenantId() || undefined }),
    });
    if (res.ok) {
      showToast("Caja abierta", "success");
      setOpeningAmount("");
      fetchData();
    } else {
      const err = await res.json();
      showToast(err.error || "Error", "error");
    }
  };

  const closeRegister = async () => {
    if (!closingAmount) {
      showToast("Ingresa el monto contado", "error");
      return;
    }

    const ok = await confirm({
      title: "Cerrar Caja",
      message: `Confirmas el cierre de caja con ${formatCurrency(parseInt(closingAmount))} contados?`,
      confirmText: "Cerrar Caja",
      variant: "warning",
    });
    if (!ok) return;

    const res = await fetch("/api/caja", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closingAmount: parseInt(closingAmount),
        notes: closingNotes || null,
        tenantId: getActiveTenantId() || undefined,
      }),
    });

    if (res.ok) {
      showToast("Caja cerrada", "success");
      setClosingAmount("");
      setClosingNotes("");
      fetchData();
    } else {
      const err = await res.json();
      showToast(err.error || "Error", "error");
    }
  };

  if (loading || !lockReady || lockEnabled === null) return <Spinner />;

  if (lockEnabled && locked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Caja apagada</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">Ingresa el PIN de recepción para encenderla.</p>
          <input type="password" inputMode="numeric" maxLength={4} value={unlockPin} autoFocus
            onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => { if (e.key === "Enter") unlockCaja(); }}
            placeholder="••••" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em]" />
          {unlockError && <p className="text-red-500 text-sm mt-2">{unlockError}</p>}
          <button onClick={unlockCaja} disabled={unlockPin.length !== 4 || unlocking}
            className="w-full mt-4 py-3 bg-brand-blue text-white rounded-xl font-bold disabled:opacity-40">
            {unlocking ? "Verificando…" : "Encender caja"}
          </button>
        </div>
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const selectedDateLabel = new Intl.DateTimeFormat("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${selectedDate}T12:00:00Z`));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <ReceptionistGreeting className="mb-0.5" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Caja Diaria</h1>
          <p className="text-gray-500 text-sm">{isToday ? todayLabel : selectedDateLabel}</p>
        </div>
        {lockEnabled && (
          <button type="button" onClick={lockCaja}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
            🔒 Apagar caja
          </button>
        )}
        {/* Punto Nico (25-sep): ver e historiar dias anteriores, solo Administrador. */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSelectedDate(todayInChile())}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${isToday ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              Hoy
            </button>
            <button type="button" onClick={() => setSelectedDate(dateStrOffset(todayInChile(), -1))}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedDate === dateStrOffset(todayInChile(), -1) ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              Ayer
            </button>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm text-gray-600">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <input type="date" value={selectedDate} max={todayInChile()}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="text-sm text-gray-600 bg-transparent outline-none" />
            </div>
          </div>
        )}
      </div>

      {!isToday && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          Viendo el historial de {selectedDateLabel}. Abrir, cerrar o reabrir caja solo aplica al dia de hoy.
        </div>
      )}

      {/* Status */}
      <div className={`rounded-lg p-4 border-2 ${
        data?.isOpen ? "border-green-300 bg-green-50" :
        data?.register?.status === "closed" ? "border-gray-300 bg-gray-50" :
        "border-yellow-300 bg-yellow-50"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            data?.isOpen ? "bg-green-500 animate-pulse" :
            data?.register?.status === "closed" ? "bg-gray-400" :
            "bg-yellow-500"
          }`} />
          <span className="font-medium text-gray-800">
            {data?.isOpen ? "Caja Abierta" :
             data?.register?.status === "closed" ? "Caja Cerrada" :
             "Caja No Abierta"}
          </span>
          {isToday && data?.register?.status === "closed" && (
            <button onClick={() => setShowReopenModal(true)}
              className="ml-3 px-3 py-1 text-xs border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 font-medium">
              Reabrir caja
            </button>
          )}
          {data?.register?.opened_at && (
            <span className="text-xs text-gray-500 ml-auto">
              Abierta: {new Date(data.register.opened_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              {data.register.closed_at && ` · Cerrada: ${new Date(data.register.closed_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          )}
        </div>
      </div>

      {/* Descuento por planilla: aprobar con el codigo del profesional */}
      {isToday && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h3 className="font-bold text-gray-800">Descuento por planilla</h3>
          <p className="text-xs text-gray-500 mb-3">Ingresa el código que te da el profesional. Recién ahí se descuenta el stock y se anota en su libro.</p>
          <div className="flex gap-2">
            <input value={planillaCode} onChange={(e) => setPlanillaCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") approvePlanilla(); }}
              placeholder="CÓDIGO" className="w-40 border border-gray-200 rounded-xl px-3 py-2 text-center font-mono tracking-widest" />
            <button onClick={() => approvePlanilla()} disabled={planillaCode.length !== 6 || planillaBusy}
              className="px-4 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium disabled:opacity-40">
              {planillaBusy ? "Aprobando…" : "Aprobar"}
            </button>
          </div>
          {planillaPending.length > 0 && (
            <ul className="mt-3 divide-y text-sm">
              {planillaPending.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-gray-700">{p.barber_name} · {p.product_name} x{p.quantity} · {formatCurrency(Number(p.total))}{p.over_limit && <span className="ml-1 text-amber-600">(supera 15%)</span>}</span>
                  <button onClick={() => rejectPlanilla(p.id)} className="text-xs text-red-500 hover:underline">Rechazar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Open register — solo aplica al dia de hoy */}
      {isToday && !data?.register && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
          <h3 className="font-bold text-gray-800 mb-4">Abrir Caja</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Monto inicial en caja (efectivo)</label>
              <input type="number" min="0" step="1000" value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="Ej: 50000"
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <button onClick={openRegister}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              Abrir Caja
            </button>
          </div>
        </div>
      )}

      {/* Summary (when open or closed) */}
      {data?.register && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Apertura</p>
              <p className="text-xl font-bold">{formatCurrency(data.summary.openingAmount)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Ingresos Efectivo</p>
              <p className="text-xl font-bold text-green-600">+{formatCurrency(data.summary.cashIncome)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Egresos Efectivo</p>
              <p className="text-xl font-bold text-red-600">-{formatCurrency(data.summary.cashExpense)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center border-2 border-blue-200">
              <p className="text-xs text-gray-500 uppercase">Esperado en Caja</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(data.summary.expectedCash)}</p>
            </div>
          </div>
          {!!data.summary.adjustmentsTotal && data.summary.adjustmentsTotal !== 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Ajuste de caja del administrador: {data.summary.adjustmentsTotal > 0 ? "+" : "-"}{formatCurrency(Math.abs(data.summary.adjustmentsTotal))} (efectivo real declarado tras revisar un reporte); ya está incluido en el esperado.
            </div>
          )}
          {!!data.summary.withdrawalsTotal && data.summary.withdrawalsTotal > 0 && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
              Se retiraron {formatCurrency(data.summary.withdrawalsTotal)} a la caja fuerte (reducción de efectivo); ya están descontados del esperado.
            </div>
          )}

          {/* Additional stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Ventas Tarjeta</p>
              <p className="text-lg font-bold text-purple-600">{formatCurrency(data.summary.cardIncome)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Total Ventas</p>
              <p className="text-lg font-bold">{formatCurrency(data.summary.totalIncome)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase">Operaciones</p>
              <p className="text-lg font-bold">{data.summary.transactionCount}</p>
            </div>
          </div>

          {/* Rental barbers' own cash — informational, NOT part of the salon till. */}
          {!!data.summary.rentalCashToBarber && data.summary.rentalCashToBarber > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-xl">💵</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-800">
                  Efectivo de profesionales en arriendo: {formatCurrency(data.summary.rentalCashToBarber)}
                </p>
                <p className="text-xs text-orange-600">
                  Este efectivo se lo llevan los profesionales directamente. No cuenta en la caja ni en los ingresos del salon.
                </p>
              </div>
            </div>
          )}

          {/* Close register — solo aplica al dia de hoy */}
          {isToday && data.isOpen && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 border-2 border-yellow-200">
              <h3 className="font-bold text-gray-800 mb-4">Cerrar Caja</h3>
              <p className="text-sm text-gray-500 mb-4">Cuenta el efectivo en caja y registra el monto.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Monto contado ($)</label>
                  <input type="number" min="0" step="100" value={closingAmount}
                    onChange={(e) => setClosingAmount(e.target.value)}
                    placeholder={String(data.summary.expectedCash)}
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Notas (opcional)</label>
                  <input type="text" value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Observaciones del cierre..."
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <button onClick={closeRegister}
                disabled={!closingAmount}
                className="mt-4 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium disabled:opacity-50">
                Cerrar Caja
              </button>
            </div>
          )}

          {/* Closed result */}
          {data.register.status === "closed" && data.register.closing_amount !== null && (
            <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 border-2 ${
              Number(data.register.difference) === 0 ? "border-green-300" :
              Number(data.register.difference) > 0 ? "border-blue-300" : "border-red-300"
            }`}>
              <h3 className="font-bold text-gray-800 mb-3">Resultado del Cierre</h3>
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:gap-4">
                <div>
                  <p className="text-xs text-gray-500">Esperado</p>
                  <p className="text-lg font-bold">{formatCurrency(Number(data.register.expected_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Contado</p>
                  <p className="text-lg font-bold">{formatCurrency(Number(data.register.closing_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Diferencia</p>
                  <p className={`text-lg font-bold ${
                    Number(data.register.difference) === 0 ? "text-green-600" :
                    Number(data.register.difference) > 0 ? "text-blue-600" : "text-red-600"
                  }`}>
                    {Number(data.register.difference) >= 0 ? "+" : ""}{formatCurrency(Number(data.register.difference))}
                  </p>
                </div>
              </div>
              {Number(data.register.difference) === 0 && (
                <p className="text-center text-green-600 font-medium mt-3">Caja cuadrada!</p>
              )}
              {Number(data.register.difference) > 0 && (
                <p className="text-center text-blue-600 text-sm mt-3">Sobrante de {formatCurrency(Number(data.register.difference))}</p>
              )}
              {Number(data.register.difference) < 0 && (
                <p className="text-center text-red-600 text-sm mt-3">Faltante de {formatCurrency(Math.abs(Number(data.register.difference)))}</p>
              )}
            </div>
          )}

          {/* Movimientos del dia — TODOS, con quien los emitio y desde donde (Standby, Punto de venta, retiros, ajustes),
              y el efectivo que deberia haber en caja despues de cada uno. Asi quien cierra la caja puede seguir el rastro
              completo aunque los movimientos los haya hecho otra persona en otro horario. */}
          {(() => {
            type Row = {
              key: string; kind: "open" | "tx" | "withdrawal" | "adjustment"; at: number; tx?: any;
              label: string; amount: number; sign: "+" | "-" | ""; method: string; by: string | null; origin: string; originKey: string;
              barber: string | null; barberId: string | null; tip: number; cashDelta: number;
            };
            const rows: Row[] = [];
            if (data.register) {
              rows.push({
                key: "open", kind: "open", at: new Date(data.register.opened_at || data.register.created_at || 0).getTime(), label: "Apertura de caja",
                amount: Number(data.summary.openingAmount), sign: "", method: "Efectivo", by: data.register.opened_by_profile?.name || null,
                origin: "Caja", originKey: "caja", barber: null, barberId: null, tip: 0, cashDelta: Number(data.summary.openingAmount),
              });
            }
            for (const t of data.transactions) {
              const cashLike = t.payment_method === "cash" || (t.payment_method === "mixed" && Number(t.cashAmount) > 0);
              const cash = Number(t.cashAmount ?? t.total);
              const delta = !cashLike ? 0 : t.type === "income" ? (t.barberTakesCash ? 0 : cash) : -cash;
              // Origen: lo guardado en la venta; en movimientos antiguos se deduce: egresos = Finanzas, "[Manual]" = manual.
              const originKey = t.origin === "standby" ? "standby" : t.origin === "pos" ? "pos" : t.origin === "manual" || String(t.notes || "").startsWith("[Manual]") ? "manual"
                : t.type === "expense" ? "finanzas" : "otro";
              rows.push({
                key: t.id, kind: "tx", tx: t, at: new Date(t.created_at).getTime(),
                label: t.services || t.notes || (t.type === "income" ? "Venta" : "Gasto"), amount: Number(t.total), sign: t.type === "income" ? "+" : "-",
                method: paymentLabels[t.payment_method] || t.payment_method, by: t.issuedByName || null,
                origin: originKey === "standby" ? "Standby" : originKey === "pos" ? "Punto de venta" : originKey === "manual" ? "Manual" : originKey === "finanzas" ? "Finanzas" : "Sin dato", originKey,
                barber: t.barberName || null, barberId: t.barber_id || null, tip: Number(t.tip_amount || 0), cashDelta: delta,
              });
            }
            for (const w of data.withdrawals || []) {
              rows.push({
                key: `w-${w.id}`, kind: "withdrawal", at: new Date(w.created_at).getTime(), label: w.note || "Retiro a la caja fuerte", amount: Number(w.amount), sign: "-",
                method: "Efectivo", by: w.created_by_name, origin: "Retiro", originKey: "ajustes", barber: null, barberId: null, tip: 0, cashDelta: -Number(w.amount),
              });
            }
            for (const a of data.adjustments || []) {
              rows.push({
                key: `a-${a.id}`, kind: "adjustment", at: new Date(a.created_at).getTime(), label: `Ajuste de caja: ${a.note}`, amount: Math.abs(Number(a.amount)), sign: Number(a.amount) < 0 ? "-" : "+",
                method: "Efectivo", by: a.created_by_name, origin: "Ajuste", originKey: "ajustes", barber: null, barberId: null, tip: 0, cashDelta: Number(a.amount),
              });
            }
            rows.sort((x, y) => x.at - y.at);
            // Efectivo que deberia haber en caja despues de cada movimiento (acumulado).
            let running = 0;
            const withBalance = rows.map((r) => { running += r.cashDelta; return { ...r, balance: running }; });

            const filteredAsc = withBalance.filter((r) => {
              if (barberFilter !== "all" && (r.kind !== "tx" || (r.barberId || "none") !== barberFilter)) return false;
              if (originFilter !== "all" && r.kind !== "open" && r.originKey !== originFilter) return false;
              return true;
            });
            const filtered = timeOrder === "asc" ? filteredAsc : [...filteredAsc].reverse();
            const barbersWithMovements = Array.from(
              new Map(data.transactions.filter((t) => t.barberName).map((t) => [t.barber_id, t.barberName])).entries()
            ) as [string, string][];
            const colors: Record<string, string> = { standby: "bg-indigo-50 text-indigo-700", pos: "bg-sky-50 text-sky-700", manual: "bg-violet-50 text-violet-700", finanzas: "bg-rose-50 text-rose-700", ajustes: "bg-amber-50 text-amber-700", caja: "bg-gray-100 text-gray-600", otro: "bg-gray-100 text-gray-500" };

            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-gray-800">Movimientos del Dia ({filtered.length})</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setTimeOrder(timeOrder === "asc" ? "desc" : "asc")}
                      className="border rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" title="Cambiar el orden por hora">
                      {timeOrder === "asc" ? "Hora ↑ primeros primero" : "Hora ↓ últimos primero"}
                    </button>
                    <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs">
                      <option value="all">Todo origen</option>
                      <option value="standby">Standby</option>
                      <option value="pos">Punto de venta</option>
                      <option value="manual">Manual</option>
                      <option value="finanzas">Finanzas (egresos)</option>
                      <option value="ajustes">Retiros y ajustes</option>
                    </select>
                    {barbersWithMovements.length > 0 && (
                      <select value={barberFilter} onChange={(e) => setBarberFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs">
                        <option value="all">Todos los profesionales</option>
                        {barbersWithMovements.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
                      </select>
                    )}
                    {isToday && (
                      <button onClick={() => setShowManualModal(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-medium">
                        + Registrar movimiento
                      </button>
                    )}
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <p className="p-6 text-center text-gray-400">Sin movimientos</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                      <thead className="bg-gray-50 border-b text-left">
                        <tr>
                          <th className="p-3 font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" onClick={() => setTimeOrder(timeOrder === "asc" ? "desc" : "asc")} title="Cambiar el orden por hora">
                            Hora {timeOrder === "asc" ? "↑" : "↓"}
                          </th>
                          <th className="p-3 font-medium text-gray-600">Origen</th>
                          <th className="p-3 font-medium text-gray-600">Emitido por</th>
                          <th className="p-3 font-medium text-gray-600">Profesional</th>
                          <th className="p-3 font-medium text-gray-600">Detalle</th>
                          <th className="p-3 font-medium text-gray-600 text-right">Monto</th>
                          <th className="p-3 font-medium text-gray-600">Metodo</th>
                          <th className="p-3 font-medium text-gray-600 text-right">Propina</th>
                          <th className="p-3 font-medium text-gray-600 text-right" title="Efectivo que deberia haber en caja despues de este movimiento">Efectivo en caja</th>
                          <th className="p-3 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map((r) => {
                          const t = r.tx;
                          return (
                            <tr key={r.key} className="hover:bg-gray-50">
                              <td className="p-3 text-gray-500 whitespace-nowrap">{new Date(r.at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</td>
                              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[r.originKey]}`}>{r.origin}</span></td>
                              <td className="p-3 text-gray-700">{r.by || <span className="text-gray-300">—</span>}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {r.kind === "tx" && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.sign === "+" ? "bg-green-500" : "bg-red-500"}`} />}
                                  {r.barber || <span className="text-gray-300">—</span>}
                                </div>
                              </td>
                              <td className="p-3 max-w-[260px] truncate" title={r.label}>{r.label}</td>
                              <td className={`p-3 text-right font-medium whitespace-nowrap ${r.sign === "+" ? "text-green-600" : r.sign === "-" ? "text-red-600" : "text-gray-700"}`}>
                                {r.sign}{formatCurrency(r.amount)}
                              </td>
                              <td className="p-3 text-gray-600">{r.method}</td>
                              <td className="p-3 text-right text-gray-600">{r.tip ? formatCurrency(r.tip) : "—"}</td>
                              <td className={`p-3 text-right font-semibold whitespace-nowrap ${r.balance < 0 ? "text-red-600" : "text-gray-800"}`}>{formatCurrency(r.balance)}</td>
                              <td className="p-3 text-right relative" ref={t && openMenuId === t.id ? menuRef : undefined}>
                                {t && (
                                  <>
                                    <button type="button" onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)} disabled={deletingId === t.id}
                                      className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-50" aria-label="Mas acciones">
                                      {deletingId === t.id ? "…" : "⋮"}
                                    </button>
                                    {openMenuId === t.id && (
                                      <div className="absolute right-3 top-10 z-10 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-36 text-left">
                                        <button onClick={() => handleMenuEdit(t)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Modificar</button>
                                        <button onClick={() => handleMenuDelete(t)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t">"Efectivo en caja" suma la apertura y cada movimiento en efectivo, en orden. Si una fila no coincide con lo que hay de verdad, ahí empezó la diferencia.</p>
              </div>
            );
          })()}
        </>
      )}

      {/* Manual movement modal — for a card charge that went through but re-booking
          didn't record. Requires admin PIN. */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowManualModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark mb-1">Registrar movimiento manual</h3>
            <p className="text-sm text-brand-gray mb-4">Usa esto si la maquina cobro pero la venta no quedo registrada. Requiere PIN de administrador.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Profesional</label>
                <select value={manualForm.barberId} onChange={(e) => setManualForm({ ...manualForm, barberId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin asignar</option>
                  {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Servicio</label>
                <input type="text" value={manualForm.serviceName} onChange={(e) => setManualForm({ ...manualForm, serviceName: e.target.value })}
                  placeholder="Ej: Corte, Corte y barba" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Precio ($)</label>
                  <input type="number" min="0" value={manualForm.amount} onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                    placeholder="15000" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Propina ($)</label>
                  <input type="number" min="0" value={manualForm.tip} onChange={(e) => setManualForm({ ...manualForm, tip: e.target.value })}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Metodo de pago</label>
                <select value={manualForm.paymentMethod} onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="debit_card">Debito</option>
                  <option value="credit_card">Credito</option>
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notas (opcional)</label>
                <input type="text" value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                  placeholder="Ej: fallo el pago en maquina, cobrado igual" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">PIN de administrador</label>
                <input type="password" inputMode="numeric" maxLength={6} value={manualForm.pin}
                  onChange={(e) => setManualForm({ ...manualForm, pin: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••" className="w-full border rounded-lg px-3 py-2 text-center tracking-widest" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowManualModal(false)}
                  className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={submitManualMovement} disabled={manualSaving}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {manualSaving ? "Registrando..." : "Registrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowReopenModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brand-dark">Reabrir Caja</h3>
              <p className="text-sm text-brand-gray mt-1">Accion excepcional. Requiere PIN de administrador.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-brand-gray block mb-1">PIN Admin (4 digitos)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={reopenPin}
                  onChange={(e) => { setReopenPin(e.target.value.replace(/\D/g, "")); setReopenError(""); }}
                  placeholder="••••"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && reopenPin.length === 4) handleReopen(); }}
                  className="w-full border-2 rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:border-orange-400 outline-none"
                />
              </div>

              {reopenError && <p className="text-xs text-red-500 text-center">{reopenError}</p>}

              <div className="flex gap-2">
                <button onClick={() => { setShowReopenModal(false); setReopenPin(""); setReopenError(""); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={handleReopen} disabled={reopenPin.length !== 4 || reopening}
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                  {reopening ? "Reabriendo..." : "Confirmar reapertura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN gate — solo Recepcion, antes de modificar o eliminar un movimiento */}
      {pinGate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPinGate(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brand-dark">
                {pinGate.action === "edit" ? "Modificar movimiento" : "Eliminar movimiento"}
              </h3>
              <p className="text-sm text-brand-gray mt-1">Requiere PIN de administrador.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-brand-gray block mb-1">PIN Admin (4 digitos)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={gatePin}
                  onChange={(e) => { setGatePin(e.target.value.replace(/\D/g, "")); setGateError(""); }}
                  placeholder="••••"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && gatePin.length === 4) handleGateSubmit(); }}
                  className="w-full border-2 rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:border-orange-400 outline-none"
                />
              </div>

              {gateError && <p className="text-xs text-red-500 text-center">{gateError}</p>}

              <div className="flex gap-2">
                <button onClick={() => setPinGate(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={handleGateSubmit} disabled={gatePin.length !== 4 || gateVerifying}
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                  {gateVerifying ? "Verificando..." : "Continuar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — Administrador entra directo (con doble confirmacion al guardar);
          Recepcion llega aca solo despues de validar el PIN en el porton de arriba. */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditingTx(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark mb-1">Modificar movimiento</h3>
            <p className="text-sm text-brand-gray mb-4">Corrige los datos de este movimiento.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Profesional</label>
                <select value={editForm.barberId} onChange={(e) => setEditForm({ ...editForm, barberId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin asignar</option>
                  {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Servicio</label>
                <input type="text" value={editForm.serviceName}
                  onChange={(e) => setEditForm({ ...editForm, serviceName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Precio ($)</label>
                  <input type="number" min="0" value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Propina ($)</label>
                  <input type="number" min="0" value={editForm.tip}
                    onChange={(e) => setEditForm({ ...editForm, tip: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Metodo de pago</label>
                <select value={editForm.paymentMethod} onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cash">Efectivo</option>
                  <option value="debit_card">Debito</option>
                  <option value="credit_card">Credito</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingTx(null)}
                  className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {savingEdit ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
