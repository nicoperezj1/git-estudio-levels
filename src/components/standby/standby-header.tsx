"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { formatCurrency } from "@/lib/utils";

interface Product { id: string; name: string; price: number; stock: number }
interface OpenProblem { open: number; latest: { reported_by_name: string | null; note: string; created_at: string } | null }

// Encabezado del Standby nuevo (sobre el Punto de Venta). Su objetivo es CONTROLAR EL EFECTIVO paso a paso:
//  - Al entrar muestra "Dinero en caja" y pide confirmar que coincide con lo que hay de verdad.
//  - Si no coincide: Reportar problema (contexto + consentimiento). Se puede seguir vendiendo; el reporte queda en
//    ROJO para todos hasta que el administrador lo resuelva con su codigo y declare el efectivo real.
//  - Descuento por planilla y Cerrar sesion.
export function StandbyHeader({ barber, products, saleCounter, onExit, onReview }: { barber: { id: string; name: string }; products: Product[]; saleCounter: number; onExit: () => void; onReview?: () => void }) {
  const { showToast } = useToast();
  const { tenant } = useTenant();
  const [cash, setCash] = useState<number | null>(null);
  const [problem, setProblem] = useState<OpenProblem>({ open: 0, latest: null });
  const [entryOpen, setEntryOpen] = useState(true);

  const [reportOpen, setReportOpen] = useState(false);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [shownAtReport, setShownAtReport] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const [planillaOpen, setPlanillaOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { code: string; total: number; overLimit: boolean }>(null);

  const load = useCallback(() => {
    fetch(`/api/caja${tenant?.id ? `?tenantId=${tenant.id}` : ""}`).then((r) => r.json()).then((d) => setCash(Number(d?.summary?.expectedCash) || 0)).catch(() => {});
    fetch("/api/problemas?summary=1").then((r) => r.json()).then(setProblem).catch(() => {});
  }, [tenant?.id]);
  useEffect(() => { load(); }, [load, saleCounter]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { window.addEventListener("standby-refresh", load); return () => window.removeEventListener("standby-refresh", load); }, [load]);

  const openReport = () => { setShownAtReport(cash); setNote(""); setConsent(false); setReportOpen(true); };

  const sendReport = async () => {
    if (!note.trim() || !consent || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/problemas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, context: "caja", reportedBy: barber.id, shownCash: shownAtReport, consent: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo enviar");
      showToast("Problema reportado. Puedes seguir vendiendo.", "success");
      setReportOpen(false); setEntryOpen(false); setNote("");
      load();
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

  const hasProblem = problem.open > 0;
  return (
    <div className="mb-4">
      {hasProblem && (
        <div className="mb-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">⚠ Hay un problema de caja sin resolver ({problem.open})</p>
          {problem.latest && <p className="mt-0.5 text-xs">{problem.latest.reported_by_name || "Equipo"}: “{problem.latest.note}”</p>}
          {onReview ? (
            <button onClick={onReview} className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Resolver ahora (revisión de caja)</button>
          ) : (
            <p className="mt-0.5 text-[11px] text-red-500">El administrador lo resuelve con su código en Standby, declarando el efectivo real.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">Hola, {barber.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-brand-gray">¿Qué vas a cobrar?</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {cash !== null && (
            <span className={`rounded-xl px-3 py-1.5 font-semibold ${hasProblem || cash < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>Dinero en caja {formatCurrency(cash)}</span>
          )}
          <button onClick={openReport} className={`rounded-xl border px-3 py-1.5 font-medium ${hasProblem ? "border-red-300 bg-red-50 text-red-600" : "border-gray-200 bg-white text-brand-dark hover:bg-gray-50"}`}>Reportar problema</button>
          <button onClick={() => { setPlanillaOpen(true); setResult(null); setProductId(""); setQty(1); }} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-brand-dark hover:bg-gray-50">Descuento por planilla</button>
          <button onClick={onExit} className="rounded-xl px-3 py-1.5 font-medium text-brand-gray hover:text-brand-dark">Cerrar sesión</button>
        </div>
      </div>

      {/* Al entrar: ¿el dinero en caja coincide con lo que hay de verdad? */}
      {entryOpen && cash !== null && !reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-sm text-gray-500">Dinero en caja</p>
            <p className={`mt-1 text-4xl font-black tabular-nums ${hasProblem ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(cash)}</p>
            {hasProblem && <p className="mt-2 text-xs text-red-600">Hay un problema de caja sin resolver; este monto puede no ser el real.</p>}
            <p className="mt-4 text-sm text-gray-600">¿Coincide con el efectivo que hay realmente en la caja?</p>
            <div className="mt-4 space-y-2">
              <button onClick={() => setEntryOpen(false)} className="w-full rounded-xl bg-brand-blue py-3 font-bold text-white">Sí, coincide</button>
              <button onClick={openReport} className="w-full rounded-xl border border-red-300 bg-red-50 py-3 font-medium text-red-600">No coincide: reportar problema</button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Reportar problema</h2>
            {shownAtReport !== null && <p className="mt-1 text-xs text-gray-500">La caja muestra {formatCurrency(shownAtReport)}.</p>}
            <p className="mt-1 text-xs text-gray-500">Cuenta qué pasó (ej: "en caja hay $20.000 y el sistema dice $30.000"). Le llega al administrador y queda en rojo hasta que lo resuelva.</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} autoFocus placeholder="Cuéntanos qué pasó…" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <label className="mt-3 flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span>Confirmo que lo informado es verdad y dejo constancia de este reporte. Puedo seguir con mi venta.</span>
            </label>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setReportOpen(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-gray-700">Cancelar</button>
              <button onClick={sendReport} disabled={!note.trim() || !consent || sending} className="flex-1 rounded-xl bg-red-600 py-2.5 font-bold text-white disabled:opacity-50">{sending ? "Enviando…" : "Reportar y continuar"}</button>
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
