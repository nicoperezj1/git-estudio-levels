"use client";

import { useState } from "react";
import { useTenant } from "@/lib/tenant-context";
import { EmptyIcons } from "@/components/ui/empty-state";
import PosScreen from "@/components/pos/pos-screen";
import { StandbyAdmin } from "@/components/standby/standby-admin";

// Standby nuevo (Fase 5): el profesional entra con su PIN y ve el MISMO Punto de Venta (servicios y
// productos, cliente, cupon, descuento, puntos, propina, pago dividido…). Todo lo que cobra queda igual
// que una venta normal (ingresos, caja, cierre mensual, metricas). La unica diferencia es como entra el
// dinero: no se activa la maquina de tarjeta; el profesional registra el pago.
// Se activa en Configuracion > Caja y Standby; si esta apagado se ve el Standby de siempre.
export default function StandbyV2() {
  const { tenant } = useTenant();
  const [barber, setBarber] = useState<{ id: string; name: string } | null>(null);
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const verifyPin = async () => {
    setPinError("");
    const res = await fetch(`/api/barber/verify-pin${tenant?.id ? `?tenantId=${tenant.id}` : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.valid) { setBarber(data.barber); return; }
    // No es un profesional: ¿es el codigo del administrador? (revision de caja)
    const r2 = await fetch("/api/pos/verify-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }) });
    const a = await r2.json().catch(() => ({}));
    if (a.valid && a.adminId) setAdmin({ id: a.adminId, name: a.adminName });
    else setPinError("Código incorrecto");
  };

  if (admin) return <StandbyAdmin admin={admin} pin={pinInput} onExit={() => { setAdmin(null); setPinInput(""); }} />;
  if (barber) return <PosScreen standby={{ barber, onExit: () => { setBarber(null); setPinInput(""); } }} />;

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
