"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";

// Reduccion de efectivo en el POS: despues de cada cobro, si el efectivo de la caja supera el tope del
// negocio, pide llevar el excedente a la caja fuerte (Confirmar) o reportar un problema. Sin tope
// configurado no hace nada. `trigger` sube cada vez que se registra una venta.
export function CashReductionPrompt({ trigger, tenantId }: { trigger: number; tenantId?: string }) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!trigger) return;
    // Con un problema de caja sin resolver el efectivo del sistema no es confiable: no se pide reducir.
    fetch("/api/problemas?summary=1")
      .then((r) => r.json())
      .then((p) => {
        if (p?.open > 0) return null;
        return fetch(`/api/caja${tenantId ? `?tenantId=${tenantId}` : ""}`).then((r) => r.json());
      })
      .then((d) => {
        if (!d) return;
        const cap = Number(d?.summary?.cashCap);
        const expected = Number(d?.summary?.expectedCash);
        if (cap > 0 && expected > cap) setAmount(Math.round(expected - cap));
      })
      .catch(() => {});
  }, [trigger, tenantId]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/caja/retiros", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json().catch(() => ({}));
      showToast(res.ok ? `Reducción de ${formatCurrency(d.amount)} registrada` : (d?.error || "No se pudo registrar"), res.ok ? "success" : "error");
      setAmount(0);
    } finally { setBusy(false); }
  };

  const report = async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/problemas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, context: "reduccion_efectivo" }) });
      showToast(res.ok ? "Problema reportado al administrador" : "No se pudo enviar", res.ok ? "success" : "error");
      if (res.ok) { setReporting(false); setNote(""); setAmount(0); }
    } finally { setBusy(false); }
  };

  if (amount <= 0) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        {reporting ? (
          <>
            <h2 className="text-lg font-bold text-gray-900">Reportar problema</h2>
            <p className="text-xs text-gray-500 mt-1">Le llega al administrador.</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} autoFocus
              className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Cuéntanos qué pasó…" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setReporting(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700">Volver</button>
              <button onClick={report} disabled={!note.trim() || busy} className="flex-1 py-2.5 rounded-xl bg-brand-blue text-white font-bold disabled:opacity-50">Enviar</button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-2">🏦</div>
            <h2 className="text-lg font-bold text-gray-900">Reducción de efectivo</h2>
            <p className="text-sm text-gray-600 mt-2">Haz una reducción de <b>{formatCurrency(amount)}</b> y déjalo en la caja fuerte.</p>
            <div className="mt-5 space-y-2">
              <button onClick={confirm} disabled={busy} className="w-full py-3 rounded-xl bg-brand-blue text-white font-bold disabled:opacity-50">{busy ? "Registrando…" : "Confirmar"}</button>
              <button onClick={() => setReporting(true)} className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium">Reportar problema</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
