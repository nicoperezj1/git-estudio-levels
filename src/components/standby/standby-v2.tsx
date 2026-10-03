"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { formatCurrency } from "@/lib/utils";
import { EmptyIcons } from "@/components/ui/empty-state";

// Standby nuevo (Fase 5): igual de simple que antes, pero ahora saluda al profesional, muestra SUS
// servicios (con su precio) y los productos de venta, avisa cuando hay que llevar efectivo a la caja
// fuerte, deja reportar un problema y generar un codigo de descuento por planilla.
// Se activa en Configuracion > Caja y Standby; si esta apagado se ve el Standby de siempre.

interface Item { id: string; name: string; price: number; stock?: number }
type Line = { id: string; name: string; price: number; qty: number; type: "service" | "product"; stock?: number };

const METHODS = [
  { key: "cash", label: "Efectivo", icon: "💵" },
  { key: "debit_card", label: "Débito", icon: "💳" },
  { key: "credit_card", label: "Crédito", icon: "💳" },
  { key: "transfer", label: "Transfer", icon: "📱" },
];

export default function StandbyV2() {
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const tenantId = tenant?.id || "";

  const [authenticated, setAuthenticated] = useState(false);
  const [barber, setBarber] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const [services, setServices] = useState<Item[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [tab, setTab] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [processing, setProcessing] = useState(false);
  const [cashInRegister, setCashInRegister] = useState(0);

  // Reduccion de efectivo
  const [reduceAmount, setReduceAmount] = useState(0);
  const [reducing, setReducing] = useState(false);
  // Reportar problema
  const [reportOpen, setReportOpen] = useState<null | "standby" | "reduccion_efectivo">(null);
  const [reportNote, setReportNote] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  // Descuento por planilla
  const [planillaOpen, setPlanillaOpen] = useState(false);
  const [planillaProduct, setPlanillaProduct] = useState("");
  const [planillaQty, setPlanillaQty] = useState(1);
  const [planillaResult, setPlanillaResult] = useState<null | { code: string; total: number; overLimit: boolean }>(null);
  const [planillaBusy, setPlanillaBusy] = useState(false);

  const q = tenantId ? `?tenantId=${tenantId}` : "";

  const loadCash = useCallback(async (): Promise<{ expected: number; cap: number | null }> => {
    try {
      const d = await fetch(`/api/caja${q}`).then((r) => r.json());
      const expected = Number(d?.summary?.expectedCash) || 0;
      setCashInRegister(expected);
      const cap = d?.summary?.cashCap ? Number(d.summary.cashCap) : null;
      return { expected, cap };
    } catch {
      return { expected: 0, cap: null };
    }
  }, [q]);

  // Productos de venta (los insumos no se venden) y efectivo en caja.
  useEffect(() => {
    if (tenantLoading) return;
    fetch(`/api/products${q}`).then((r) => r.json()).then((d) => {
      setProducts(Array.isArray(d) ? d.filter((p: any) => (p.product_type || "sale") !== "supply" && Number(p.stock) > 0) : []);
    }).catch(() => {});
    loadCash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenantId]);

  // Los servicios que hace ESTE profesional, con su precio propio si lo tiene.
  useEffect(() => {
    if (!barber) return;
    fetch(`/api/public/barber-services?barberId=${barber.id}`).then((r) => r.json()).then((d) => {
      setServices(Array.isArray(d) ? d.map((s: any) => ({ id: s.id, name: s.name, price: Number(s.price) })) : []);
    }).catch(() => setServices([]));
  }, [barber]);

  const verifyPin = async () => {
    setPinError("");
    const res = await fetch(`/api/barber/verify-pin${q}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.valid) { setBarber(data.barber); setAuthenticated(true); }
    else setPinError("Código incorrecto");
  };

  const logout = () => {
    setAuthenticated(false); setBarber(null); setPinInput(""); setLines([]); setCashReceived("");
    setServices([]); setSearch(""); setTab("services");
  };

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const change = paymentMethod === "cash" && cashReceived ? Math.max(0, parseInt(cashReceived) - total) : 0;

  const toggleService = (s: Item) =>
    setLines((ls) => (ls.some((l) => l.id === s.id && l.type === "service")
      ? ls.filter((l) => !(l.id === s.id && l.type === "service"))
      : [...ls, { id: s.id, name: s.name, price: s.price, qty: 1, type: "service" }]));
  const changeProduct = (p: Item, delta: number) =>
    setLines((ls) => {
      const cur = ls.find((l) => l.id === p.id && l.type === "product");
      const next = (cur?.qty || 0) + delta;
      if (next <= 0) return ls.filter((l) => !(l.id === p.id && l.type === "product"));
      if (p.stock != null && next > p.stock) return ls;
      return cur
        ? ls.map((l) => (l.id === p.id && l.type === "product" ? { ...l, qty: next } : l))
        : [...ls, { id: p.id, name: p.name, price: p.price, qty: 1, type: "product", stock: p.stock }];
    });
  const qtyOf = (id: string, type: "service" | "product") => lines.find((l) => l.id === id && l.type === type)?.qty || 0;

  const handleSale = async () => {
    if (!barber || lines.length === 0 || processing) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/pos/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: barber.id, clientId: null,
          items: lines.map((l) => ({ id: l.id, name: l.name, price: l.price, quantity: l.qty, type: l.type })),
          paymentMethod, couponCode: null, discount: 0, subtotal: total, total,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo registrar la venta");
      showToast(`Venta ${formatCurrency(total)} registrada`, "success");
      setLines([]); setCashReceived("");
      // Despues de cobrar: ¿el efectivo paso el tope? Entonces toca reducir.
      const { expected, cap } = await loadCash();
      if (cap && expected > cap) setReduceAmount(Math.round(expected - cap));
    } catch (e: any) {
      showToast(e?.message || "No se pudo registrar la venta", "error");
    } finally {
      setProcessing(false);
    }
  };

  const confirmReduction = async () => {
    if (!barber || reducing) return;
    setReducing(true);
    try {
      const res = await fetch("/api/caja/retiros", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: barber.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) throw new Error(data?.error || "No se pudo registrar");
      showToast(res.ok ? `Reducción de ${formatCurrency(data.amount)} registrada` : (data?.error || "Ya estaba registrada"), res.ok ? "success" : "error");
      setReduceAmount(0);
      loadCash();
    } catch (e: any) {
      showToast(e?.message || "No se pudo registrar", "error");
    } finally {
      setReducing(false);
    }
  };

  const sendReport = async () => {
    if (!reportOpen || !reportNote.trim() || sendingReport) return;
    setSendingReport(true);
    try {
      const res = await fetch("/api/problemas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reportNote, context: reportOpen, reportedBy: barber?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo enviar");
      showToast("Problema reportado al administrador", "success");
      setReportOpen(null); setReportNote("");
      if (reportOpen === "reduccion_efectivo") setReduceAmount(0);
    } catch (e: any) {
      showToast(e?.message || "No se pudo enviar", "error");
    } finally {
      setSendingReport(false);
    }
  };

  const createPlanilla = async () => {
    if (!barber || !planillaProduct || planillaBusy) return;
    setPlanillaBusy(true);
    try {
      const res = await fetch("/api/planilla", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: barber.id, productId: planillaProduct, quantity: planillaQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo generar el código");
      setPlanillaResult({ code: data.code, total: data.total, overLimit: !!data.overLimit });
    } catch (e: any) {
      showToast(e?.message || "No se pudo generar el código", "error");
    } finally {
      setPlanillaBusy(false);
    }
  };

  // ---------- PIN ----------
  if (!authenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 ring-4 ring-indigo-100/60 flex items-center justify-center">
            <EmptyIcons.locked className="w-6 h-6 text-indigo-500" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Standby</h1>
          <p className="text-sm text-gray-500 mb-6">Ingresa tu código personal</p>
          <div className="flex gap-2 justify-center mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${pinInput.length > i ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}>
                {pinInput[i] ? "•" : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "←"].map((num, i) => (
              <button key={i}
                onClick={() => { if (num === "←") setPinInput((p) => p.slice(0, -1)); else if (num !== null && pinInput.length < 4) setPinInput((p) => p + num); }}
                disabled={num === null}
                className={`h-12 rounded-xl text-lg font-medium transition-colors ${num === null ? "invisible" : num === "←" ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-gray-50 text-gray-900 hover:bg-gray-100 active:bg-gray-200"}`}>
                {num}
              </button>
            ))}
          </div>
          <button onClick={verifyPin} disabled={pinInput.length < 4}
            className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-95">
            Ingresar
          </button>
          {pinError && <p className="text-red-500 text-sm mt-2">{pinError}</p>}
        </div>
      </div>
    );
  }

  // ---------- Venta ----------
  const needle = search.trim().toLowerCase();
  const visible = (tab === "services" ? services : products).filter((i) => !needle || i.name.toLowerCase().includes(needle));
  const firstName = (barber?.name || "").split(" ")[0];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hola, {firstName} 👋</h1>
          <p className="text-sm text-gray-500">¿Qué vas a cobrar?</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase">En caja</p>
          <p className={`text-sm font-bold ${cashInRegister < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(cashInRegister)}</p>
        </div>
      </div>

      {/* Servicios / Productos */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {([["services", "Servicios"], ["products", "Productos"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setSearch(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "services" ? "Buscar servicio…" : "Buscar producto…"}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">{tab === "services" ? "No tienes servicios asignados." : "No hay productos de venta con stock."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map((it) => {
            const qty = qtyOf(it.id, tab === "services" ? "service" : "product");
            const selected = qty > 0;
            return (
              <div key={it.id} className={`rounded-xl border p-3 text-sm transition-all ${selected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-gray-200"}`}>
                <button className="w-full text-left" onClick={() => (tab === "services" ? toggleService(it) : changeProduct(it, 1))}>
                  <p className="font-medium text-gray-900">{it.name}</p>
                  <p className="text-indigo-600 font-bold">{formatCurrency(it.price)}</p>
                  {tab === "products" && <p className="text-[11px] text-gray-400">Stock: {it.stock}</p>}
                </button>
                {tab === "products" && selected && (
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => changeProduct(it, -1)} className="h-7 w-7 rounded-lg bg-white border border-gray-200 text-gray-700">−</button>
                    <span className="text-sm font-semibold w-5 text-center">{qty}</span>
                    <button onClick={() => changeProduct(it, 1)} className="h-7 w-7 rounded-lg bg-white border border-gray-200 text-gray-700">+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pago */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Método de pago</label>
        <div className="grid grid-cols-4 gap-2">
          {METHODS.map((m) => (
            <button key={m.key} onClick={() => setPaymentMethod(m.key)}
              className={`py-3 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all ${paymentMethod === m.key ? "bg-indigo-600 text-white shadow-md" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}>
              <span>{m.icon}</span><span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {paymentMethod === "cash" && total > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monto recibido</label>
            <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder={String(total)}
              className="w-full border rounded-xl px-4 py-3 text-lg font-bold text-center" />
          </div>
          {cashReceived && parseInt(cashReceived) >= total && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Vuelto</span>
              <span className="text-xl font-bold text-orange-600">{formatCurrency(change)}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-600 font-medium">Total</span>
          <span className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</span>
        </div>
        <button onClick={handleSale}
          disabled={lines.length === 0 || processing || (paymentMethod === "cash" && !!cashReceived && parseInt(cashReceived) < total)}
          className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-green-600/20">
          {processing ? "Procesando…" : "Registrar venta"}
        </button>
      </div>

      <div className="flex items-center justify-between pt-1 text-sm">
        <button onClick={() => { setReportOpen("standby"); setReportNote(""); }} className="text-gray-500 hover:text-gray-800">Reportar problema</button>
        <button onClick={() => { setPlanillaOpen(true); setPlanillaResult(null); setPlanillaProduct(""); setPlanillaQty(1); }} className="text-gray-500 hover:text-gray-800">Descuento por planilla</button>
        <button onClick={logout} className="text-gray-400 hover:text-gray-600">Cerrar sesión</button>
      </div>

      {/* Reduccion de efectivo */}
      {reduceAmount > 0 && !reportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <div className="text-4xl mb-2">🏦</div>
            <h2 className="text-lg font-bold text-gray-900">Reducción de efectivo</h2>
            <p className="text-sm text-gray-600 mt-2">Haz una reducción de <b>{formatCurrency(reduceAmount)}</b> y déjalo en la caja fuerte.</p>
            <div className="mt-5 space-y-2">
              <button onClick={confirmReduction} disabled={reducing} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50">
                {reducing ? "Registrando…" : "Confirmar"}
              </button>
              <button onClick={() => { setReportOpen("reduccion_efectivo"); setReportNote(""); }} className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium">
                Reportar problema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reportar problema */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Reportar problema</h2>
            <p className="text-xs text-gray-500 mt-1">Le llega al administrador. Ej: "faltan $10.000".</p>
            <textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} rows={4} maxLength={1000} autoFocus
              className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Cuéntanos qué pasó…" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setReportOpen(null); setReportNote(""); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700">Cancelar</button>
              <button onClick={sendReport} disabled={!reportNote.trim() || sendingReport} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50">
                {sendingReport ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Descuento por planilla */}
      {planillaOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Descuento por planilla</h2>
            {planillaResult ? (
              <div className="text-center mt-4">
                <p className="text-sm text-gray-600">Entrega este código a recepción o al administrador para aprobarlo:</p>
                <p className="mt-3 text-4xl font-mono font-bold tracking-widest text-indigo-600">{planillaResult.code}</p>
                <p className="text-sm text-gray-500 mt-2">Total a descontar: {formatCurrency(planillaResult.total)}</p>
                {planillaResult.overLimit && <p className="mt-2 text-xs text-amber-600">Ojo: este descuento supera el 15% de tu ingreso del mes; quien lo apruebe tendrá que confirmarlo.</p>}
                <button onClick={() => setPlanillaOpen(false)} className="mt-5 w-full py-3 rounded-xl bg-indigo-600 text-white font-bold">Listo</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-1">Elige el producto. El stock se descuenta cuando lo apruebe recepción o el administrador con el código.</p>
                <select value={planillaProduct} onChange={(e) => setPlanillaProduct(e.target.value)} className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="">Elige un producto…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatCurrency(p.price)}</option>)}
                </select>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-sm text-gray-600">Cantidad</span>
                  <button onClick={() => setPlanillaQty((n) => Math.max(1, n - 1))} className="h-8 w-8 rounded-lg border border-gray-200">−</button>
                  <span className="w-6 text-center font-semibold">{planillaQty}</span>
                  <button onClick={() => setPlanillaQty((n) => Math.min(50, n + 1))} className="h-8 w-8 rounded-lg border border-gray-200">+</button>
                </div>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setPlanillaOpen(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700">Cancelar</button>
                  <button onClick={createPlanilla} disabled={!planillaProduct || planillaBusy} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50">
                    {planillaBusy ? "Generando…" : "Generar código"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
