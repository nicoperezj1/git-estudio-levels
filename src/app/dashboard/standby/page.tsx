"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { EmptyIcons } from "@/components/ui/empty-state";
import StandbyV2 from "@/components/standby/standby-v2";

interface Service { id: string; name: string; price: number; duration: number; }

function LegacyStandby() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { showToast } = useToast();

  // Auth state
  const [authenticated, setAuthenticated] = useState(false);
  const [barber, setBarber] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // Sale state
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");

  // Cash register
  const [cashInRegister, setCashInRegister] = useState(0);
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const q = t ? `?tenantId=${t}` : "";
    fetch(`/api/services${q}`).then((r) => r.json()).then((d) => {
      setServices(Array.isArray(d) ? d : []);
      setLoading(false);
    });
    // Get today's cash
    fetch(`/api/caja${q}`).then((r) => r.json()).then((d) => {
      if (d.summary) setCashInRegister(d.summary.expectedCash || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  // Verify PIN
  const verifyPin = async () => {
    setPinError("");
    const t = getActiveTenantId();
    const res = await fetch(`/api/barber/verify-pin${t ? `?tenantId=${t}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    });
    const data = await res.json();
    if (data.valid) {
      setBarber(data.barber);
      setAuthenticated(true);
      showToast(`Hola ${data.barber.name}!`, "success");
    } else {
      setPinError("Codigo incorrecto");
    }
  };

  const total = services
    .filter((s) => selectedServices.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  const change = paymentMethod === "cash" && cashReceived
    ? Math.max(0, parseInt(cashReceived) - total)
    : 0;

  const handleSale = async () => {
    if (!barber || selectedServices.length === 0) return;
    setProcessing(true);

    const items = services
      .filter((s) => selectedServices.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, price: Number(s.price), quantity: 1, type: "service" }));

    await fetch("/api/pos/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: barber.id,
        clientId: null,
        items,
        paymentMethod,
        couponCode: null,
        discount: 0,
        subtotal: total,
        total,
      }),
    });

    if (paymentMethod === "cash") {
      setCashInRegister((prev) => prev + total);
    }

    showToast(`Venta $${total.toLocaleString("es-CL")} registrada por ${barber.name}`, "success");
    setSelectedServices([]);
    setCashReceived("");
    setProcessing(false);
  };

  if (loading) return <Spinner />;

  // PIN Screen
  if (!authenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 ring-4 ring-indigo-100/60 flex items-center justify-center">
            <EmptyIcons.locked className="w-6 h-6 text-indigo-500" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Modo Standby</h1>
          <p className="text-sm text-gray-500 mb-6">Ingresa tu codigo personal</p>

          <div className="flex gap-2 justify-center mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${
                pinInput.length > i ? "border-indigo-500 bg-indigo-50" : "border-gray-200"
              }`}>
                {pinInput[i] ? "•" : ""}
              </div>
            ))}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
            {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((num, i) => (
              <button
                key={i}
                onClick={() => {
                  if (num === "←") setPinInput((p) => p.slice(0, -1));
                  else if (num !== null && pinInput.length < 4) setPinInput((p) => p + num);
                }}
                disabled={num === null}
                className={`h-12 rounded-xl text-lg font-medium transition-colors ${
                  num === null ? "invisible" :
                  num === "←" ? "bg-gray-100 text-gray-600 hover:bg-gray-200" :
                  "bg-gray-50 text-gray-900 hover:bg-gray-100 active:bg-gray-200"
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <button
            onClick={verifyPin}
            disabled={pinInput.length < 4}
            className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-95"
          >
            Ingresar
          </button>

          {pinError && <p className="text-red-500 text-sm mt-2">{pinError}</p>}
        </div>
      </div>
    );
  }

  // Sale Screen
  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Standby</h1>
          <p className="text-sm text-gray-500">{barber?.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase">En caja</p>
          {/* Red when negative: a negative till means expenses outran cash sales (or a
              bad expense was logged), so it should look like an alert, not available cash. */}
          <p className={`text-sm font-bold ${cashInRegister < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(cashInRegister)}</p>
        </div>
      </div>

      {/* Cash in register banner */}
      {paymentMethod === "cash" && (
        <div className={`border rounded-xl p-3 flex items-center justify-between ${cashInRegister < 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <span className={`text-sm ${cashInRegister < 0 ? "text-red-700" : "text-green-700"}`}>Efectivo en caja</span>
          <span className={`font-bold ${cashInRegister < 0 ? "text-red-700" : "text-green-700"}`}>{formatCurrency(cashInRegister)}</span>
        </div>
      )}

      {/* Services */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Servicios</label>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => {
            const isSelected = selectedServices.includes(s.id);
            return (
              <button key={s.id}
                onClick={() => setSelectedServices(isSelected ? selectedServices.filter((x) => x !== s.id) : [...selectedServices, s.id])}
                className={`p-3 rounded-xl border text-left text-sm transition-all active:scale-95 ${
                  isSelected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-gray-200 hover:border-gray-300"
                }`}>
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-indigo-600 font-bold">{formatCurrency(Number(s.price))}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Metodo de pago</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: "cash", label: "Efectivo", icon: "💵" },
            { key: "debit_card", label: "Debito", icon: "💳" },
            { key: "credit_card", label: "Credito", icon: "💳" },
            { key: "transfer", label: "Transfer", icon: "📱" },
          ].map((m) => (
            <button key={m.key} onClick={() => setPaymentMethod(m.key)}
              className={`py-3 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                paymentMethod === m.key ? "bg-indigo-600 text-white shadow-md" : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}>
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cash received (only for cash payments) */}
      {paymentMethod === "cash" && total > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monto recibido</label>
            <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)}
              placeholder={String(total)}
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

      {/* Total + Submit */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-600 font-medium">Total</span>
          <span className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</span>
        </div>
        <button onClick={handleSale}
          disabled={selectedServices.length === 0 || processing || (paymentMethod === "cash" && !!cashReceived && parseInt(cashReceived) < total)}
          className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-green-600/20">
          {processing ? "Procesando..." : "Registrar Venta"}
        </button>
      </div>

      {/* Logout */}
      <button onClick={() => { setAuthenticated(false); setBarber(null); setPinInput(""); }}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">
        Cerrar sesion Standby
      </button>
    </div>
  );
}

// Standby nuevo (Fase 5) solo si el administrador lo activo en Configuracion > Caja y Standby;
// si esta apagado (o la migracion 094 no esta), se ve el Standby de siempre, sin cambios.
export default function StandbyPage() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [mode, setMode] = useState<"loading" | "legacy" | "v2">("loading");
  useEffect(() => {
    if (tenantLoading) return;
    const q = tenant?.id ? `?tenantId=${tenant.id}` : "";
    fetch(`/api/settings/caja-seguridad${q}`)
      .then((r) => r.json())
      .then((d) => setMode(d?.standbyV2 ? "v2" : "legacy"))
      .catch(() => setMode("legacy"));
  }, [tenantLoading, tenant?.id]);
  if (mode === "loading") return <Spinner />;
  return mode === "v2" ? <StandbyV2 /> : <LegacyStandby />;
}
