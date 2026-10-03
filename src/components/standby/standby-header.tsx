"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { formatCurrency } from "@/lib/utils";

interface Product { id: string; name: string; price: number; stock: number }

// Encabezado del Standby nuevo (sobre el Punto de Venta): saludo, efectivo en caja y las herramientas del
// profesional: Reportar problema, Descuento por planilla y Cerrar sesion.
export function StandbyHeader({ barber, products, saleCounter, onExit }: { barber: { id: string; name: string }; products: Product[]; saleCounter: number; onExit: () => void }) {
  const { showToast } = useToast();
  const { tenant } = useTenant();
  const [cash, setCash] = useState<number | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const [planillaOpen, setPlanillaOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { code: string; total: number; overLimit: boolean }>(null);

  useEffect(() => {
    fetch(`/api/caja${tenant?.id ? `?tenantId=${tenant.id}` : ""}`).then((r) => r.json()).then((d) => setCash(Number(d?.summary?.expectedCash) || 0)).catch(() => {});
  }, [saleCounter, tenant?.id]);

  const sendReport = async () => {
    if (!note.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/problemas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, context: "standby", reportedBy: barber.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo enviar");
      showToast("Problema reportado al administrador", "success");
      setReportOpen(false); setNote("");
    } catch (e: any) { showToast(e?.message || "No se pudo enviar", "error"); } finally { setSending(false); }
  };

  const createPlanilla = async () => {
    if (!productId || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/planilla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barberId: barber.id, productId, quantity: qty }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo generar el código");
      setResult({ code: d.code, total: d.total, overLimit: !!d.overLimit });
    } catch (e: any) { showToast(e?.message || "No se pudo generar el código", "error"); } finally { setBusy(false); }
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">Hola, {barber.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-brand-gray">¿Qué vas a cobrar?</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {cash !== null && (
            <span className={`rounded-xl px-3 py-1.5 font-semibold ${cash < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>En caja {formatCurrency(cash)}</span>
          )}
          <button onClick={() => { setReportOpen(true); setNote(""); }} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-brand-dark hover:bg-gray-50">Reportar problema</button>
          <button onClick={() => { setPlanillaOpen(true); setResult(null); setProductId(""); setQty(1); }} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-brand-dark hover:bg-gray-50">Descuento por planilla</button>
          <button onClick={onExit} className="rounded-xl px-3 py-1.5 font-medium text-brand-gray hover:text-brand-dark">Cerrar sesión</button>
        </div>
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Reportar problema</h2>
            <p className="mt-1 text-xs text-gray-500">Le llega al administrador. Ej: "faltan $10.000".</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} autoFocus placeholder="Cuéntanos qué pasó…" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setReportOpen(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-gray-700">Cancelar</button>
              <button onClick={sendReport} disabled={!note.trim() || sending} className="flex-1 rounded-xl bg-brand-blue py-2.5 font-bold text-white disabled:opacity-50">{sending ? "Enviando…" : "Enviar"}</button>
            </div>
          </div>
        </div>
      )}

      {planillaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Descuento por planilla</h2>
            {result ? (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">Entrega este código a recepción o al administrador para aprobarlo:</p>
                <p className="mt-3 font-mono text-4xl font-bold tracking-widest text-brand-blue">{result.code}</p>
                <p className="mt-2 text-sm text-gray-500">Total a descontar: {formatCurrency(result.total)}</p>
                {result.overLimit && <p className="mt-2 text-xs text-amber-600">Ojo: este descuento supera el 15% de tu ingreso del mes; quien lo apruebe tendrá que confirmarlo.</p>}
                <button onClick={() => setPlanillaOpen(false)} className="mt-5 w-full rounded-xl bg-brand-blue py-3 font-bold text-white">Listo</button>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-gray-500">Elige el producto. El stock baja cuando recepción o el administrador apruebe el código.</p>
                <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm">
                  <option value="">Elige un producto…</option>
                  {products.filter((p) => Number(p.stock) > 0).map((p) => <option key={p.id} value={p.id}>{p.name} · {formatCurrency(Number(p.price))}</option>)}
                </select>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-sm text-gray-600">Cantidad</span>
                  <button onClick={() => setQty((n) => Math.max(1, n - 1))} className="h-8 w-8 rounded-lg border border-gray-200">−</button>
                  <span className="w-6 text-center font-semibold">{qty}</span>
                  <button onClick={() => setQty((n) => Math.min(50, n + 1))} className="h-8 w-8 rounded-lg border border-gray-200">+</button>
                </div>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setPlanillaOpen(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-gray-700">Cancelar</button>
                  <button onClick={createPlanilla} disabled={!productId || busy} className="flex-1 rounded-xl bg-brand-blue py-2.5 font-bold text-white disabled:opacity-50">{busy ? "Generando…" : "Generar código"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
