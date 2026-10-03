"use client";

import { useEffect, useState } from "react";
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

  if (admin) return <AdminShell admin={admin} pin={pinInput} onExit={() => { setAdmin(null); setPinInput(""); }} />;
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

// El administrador tambien puede cobrar desde Standby (en algunos negocios atiende clientes): entra SIEMPRE en la
// vista de vender y, en otra pestana, puede pasar a la revision de caja para resolver los reportes con su codigo.
function AdminShell({ admin, pin, onExit }: { admin: { id: string; name: string }; pin: string; onExit: () => void }) {
  const [tab, setTab] = useState<"vender" | "revision">("vender");
  const [open, setOpen] = useState(0);
  useEffect(() => {
    const load = () => fetch("/api/problemas?summary=1").then((r) => r.json()).then((d) => setOpen(Number(d?.open) || 0)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [tab]);
  return (
    <div>
      <div className="mx-auto flex max-w-lg items-center gap-1 px-4 pt-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-gray-100 p-1 text-sm">
          <button onClick={() => setTab("vender")} className={`flex-1 rounded-lg py-2 font-medium transition-all ${tab === "vender" ? "bg-white text-brand-dark shadow-sm" : "text-gray-500"}`}>Vender</button>
          <button onClick={() => setTab("revision")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium transition-all ${tab === "revision" ? "bg-white text-brand-dark shadow-sm" : "text-gray-500"}`}>
            Revisión de caja
            {open > 0 && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{open}</span>}
          </button>
        </div>
      </div>
      {/* La venta queda montada (no se pierde el carrito al cambiar de pestaña). */}
      <div className={tab === "vender" ? "" : "hidden"}>
        <PosScreen standby={{ barber: admin, onExit, onReview: () => setTab("revision") }} />
      </div>
      {tab === "revision" && <StandbyAdmin admin={admin} pin={pin} onExit={onExit} />}
    </div>
  );
}
