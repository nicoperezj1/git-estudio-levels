"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  description: string;
  user_name: string | null;
  reversible: boolean;
  reversed: boolean;
  reversed_at: string | null;
  created_at: string;
  metadata: any;
}

const actionLabels: Record<string, string> = {
  cash_open: "Apertura caja",
  cash_close: "Cierre caja",
  cash_reopen: "Reapertura caja",
  transaction_create: "Venta registrada",
  appointment_create: "Cita creada",
  appointment_cancel: "Cita cancelada",
  discount_applied: "Descuento aplicado",
  client_import: "Importacion clientes",
  loyalty_redeem: "Canje puntos",
  checkout_check: "Revisar venta",
};

const actionColors: Record<string, string> = {
  cash_open: "bg-green-100 text-green-700",
  cash_close: "bg-gray-100 text-gray-700",
  cash_reopen: "bg-orange-100 text-orange-700",
  transaction_create: "bg-blue-100 text-blue-700",
  appointment_create: "bg-purple-100 text-purple-700",
  appointment_cancel: "bg-red-100 text-red-700",
  discount_applied: "bg-yellow-100 text-yellow-700",
  checkout_check: "bg-red-100 text-red-700",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reversePin, setReversePin] = useState("");
  const [reverseError, setReverseError] = useState("");
  const { showToast } = useToast();

  const fetchEntries = async () => {
    setLoading(true);
    const url = filter ? `/api/audit?action=${filter}` : "/api/audit";
    const res = await fetch(url);
    setEntries(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, [filter]);

  const handleReverse = async () => {
    setReverseError("");
    if (reversePin.length !== 4) { setReverseError("PIN de 4 digitos"); return; }

    // Verify PIN
    const pinRes = await fetch("/api/pos/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: reversePin }),
    });
    const pinData = await pinRes.json();
    if (!pinData.valid) { setReverseError("PIN incorrecto"); return; }

    // Reverse
    await fetch("/api/audit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId: reverseId }),
    });

    showToast("Accion revertida", "success");
    setReverseId(null);
    setReversePin("");
    fetchEntries();
  };

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto space-y-3 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Registro de Acciones</h1>
        <p className="text-sm text-brand-gray">Historial completo de operaciones del negocio</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "", label: "Todas" },
          { key: "cash_close", label: "Cierres caja" },
          { key: "transaction_create", label: "Ventas" },
          { key: "appointment_cancel", label: "Cancelaciones" },
          { key: "cash_reopen", label: "Reaperturas" },
          { key: "discount_applied", label: "Descuentos" },
          { key: "checkout_check", label: "Ventas a revisar" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-brand-gray hover:border-brand-blue"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="text-center py-12 text-brand-gray">Cargando...</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-brand-gray">Sin registros</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className={`bg-white rounded-xl border border-gray-100 p-4 ${entry.reversed ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${actionColors[entry.action] || "bg-gray-100 text-gray-700"}`}>
                    {actionLabels[entry.action] || entry.action}
                  </span>
                  <p className="text-sm text-brand-dark">{entry.description}</p>
                  {entry.reversed && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[10px] rounded-full font-medium">REVERTIDA</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[11px] text-brand-gray">
                      {new Date(entry.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                      {" "}
                      {new Date(entry.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {entry.user_name && <p className="text-[10px] text-brand-gray">{entry.user_name}</p>}
                  </div>
                  {entry.reversible && !entry.reversed && (
                    <button onClick={() => setReverseId(entry.id)}
                      className="px-2 py-1 text-[10px] border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                      Revertir
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reverse Modal */}
      {reverseId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setReverseId(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark mb-2">Revertir accion</h3>
            <p className="text-sm text-brand-gray mb-4">Esta accion no se puede deshacer. Ingresa tu PIN de super admin.</p>
            <input
              type="password" maxLength={4} value={reversePin} autoFocus
              onChange={(e) => { setReversePin(e.target.value.replace(/\D/g, "")); setReverseError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && reversePin.length === 4) handleReverse(); }}
              placeholder="••••"
              className="w-full border-2 rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:border-red-400 outline-none mb-3"
            />
            {reverseError && <p className="text-xs text-red-500 text-center mb-3">{reverseError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setReverseId(null); setReversePin(""); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleReverse} disabled={reversePin.length !== 4}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
