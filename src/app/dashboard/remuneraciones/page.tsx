"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency, todayInChile } from "@/lib/utils";
import { computePayslip, type PayrollParams, type PayslipInput, type PayslipResult, type TaxBracket } from "@/lib/payroll";

// Remuneraciones (Fase 7): liquidaciones de sueldo de trabajadores CON contrato. Herramienta de apoyo:
// valida siempre con tu contador. Los valores legales (UF, UTM, topes, tasas, tramos) los cargas tu en
// "Parámetros del mes"; el sistema nunca los inventa.

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const labelOf = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const shift = (ym: string, d: number) => { const dt = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + d, 1)); return dt.toISOString().slice(0, 7); };

type Tab = "liquidaciones" | "fichas" | "parametros" | "guia";
const STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: "Sin liquidación", cls: "bg-gray-100 text-gray-600" },
  draft: { label: "Borrador", cls: "bg-amber-100 text-amber-700" },
  issued: { label: "Emitida", cls: "bg-blue-100 text-blue-700" },
  paid: { label: "Pagada", cls: "bg-emerald-100 text-emerald-700" },
};

async function api(url: string, method = "GET", body?: any) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "No se pudo completar");
  return data;
}

export default function RemuneracionesPage() {
  const [tab, setTab] = useState<Tab>("liquidaciones");
  const [month, setMonth] = useState(todayInChile().slice(0, 7));
  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-3 md:space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Remuneraciones</h1>
          <p className="text-sm text-brand-gray">Liquidaciones de sueldo de tus trabajadores con contrato. Herramienta de apoyo: valida con tu contador.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button onClick={() => setMonth(shift(month, -1))} className="px-2.5 py-1 text-gray-500 hover:text-brand-dark">‹</button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize text-brand-dark">{labelOf(month)}</span>
          <button onClick={() => setMonth(shift(month, 1))} className="px-2.5 py-1 text-gray-500 hover:text-brand-dark">›</button>
        </div>
      </div>
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
        {([["liquidaciones", "Liquidaciones"], ["fichas", "Fichas laborales"], ["parametros", "Parámetros del mes"], ["guia", "Guía"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 font-medium transition-all ${tab === k ? "bg-white shadow-sm text-brand-dark" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
      {tab === "liquidaciones" && <Liquidaciones month={month} goTo={setTab} />}
      {tab === "fichas" && <Fichas />}
      {tab === "parametros" && <Parametros month={month} />}
      {tab === "guia" && <Guia />}
    </div>
  );
}

/* ----------------------------- Liquidaciones ----------------------------- */

function Liquidaciones({ month, goTo }: { month: string; goTo: (t: Tab) => void }) {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { setData(null); api(`/api/remuneraciones/liquidacion?month=${month}`).then(setData).catch(() => setData({ rows: [], error: true })); }, [month]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;
  const total = (data.rows || []).reduce((s: number, r: any) => s + (r.status === "none" ? 0 : r.totalCost), 0);
  return (
    <div className="space-y-3">
      {(data.rows || []).length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-sm text-brand-gray">Aún no hay trabajadores con ficha laboral.</p>
          <button onClick={() => goTo("fichas")} className="mt-3 rounded-xl bg-brand-blue px-4 py-2 text-sm font-medium text-white">Crear una ficha laboral</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <ul className="divide-y">
            {data.rows.map((r: any) => (
              <li key={r.barberId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-dark">{r.name}</p>
                  <p className="text-xs text-brand-gray">Sueldo base {formatCurrency(r.baseSalary)}{r.status !== "none" ? ` · Líquido ${formatCurrency(r.net)}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS[r.status]?.cls}`}>{STATUS[r.status]?.label}</span>
                  <button onClick={() => setOpen(r.barberId)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-gray-50">{r.status === "none" ? "Preparar" : "Abrir"}</button>
                </div>
              </li>
            ))}
          </ul>
          {total > 0 && <p className="border-t bg-gray-50 px-4 py-2.5 text-xs text-brand-gray">Costo total empresa del mes (liquidaciones guardadas): <b className="text-brand-dark">{formatCurrency(total)}</b></p>}
        </div>
      )}
      {data.closed && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Este mes está cerrado: no se puede registrar el pago hasta reabrirlo en el Cierre Mensual.</p>}
      {open && <Editor barberId={open} month={month} onClose={() => { setOpen(null); load(); }} goTo={goTo} />}
    </div>
  );
}

function Num({ label, value, onChange, hint, step = 1 }: { label: string; value: number; onChange: (n: number) => void; hint?: string; step?: number }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-brand-gray">{label}</span>
      <input type="number" min={0} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
      {hint && <span className="block text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}

function Editor({ barberId, month, onClose, goTo }: { barberId: string; month: string; onClose: () => void; goTo: (t: Tab) => void }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inputs, setInputs] = useState<(PayslipInput & { holidays?: number }) | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const x = await api(`/api/remuneraciones/liquidacion?month=${month}&barberId=${barberId}`);
      setD(x); setInputs(x.inputs); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [month, barberId]);
  useEffect(() => { load(); }, [load]);

  const params: PayrollParams | null = d?.paramsValues || null;
  const result: PayslipResult | null = useMemo(() => (inputs && params ? computePayslip(inputs, params) : null), [inputs, params]);
  const locked = d && d.status !== "none" && d.status !== "draft";
  const set = (patch: Partial<PayslipInput>) => setInputs((i) => (i ? { ...i, ...patch } : i));

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, "success"); await load(); } catch (e: any) { showToast(e.message, "error"); } finally { setBusy(false); }
  };
  const save = () => run(() => api("/api/remuneraciones/liquidacion", "POST", { barberId, month, inputs }), "Borrador guardado");
  const act = (action: string, ok: string) => run(() => api("/api/remuneraciones/liquidacion", "PATCH", { barberId, month, action }), ok);
  const emit = async () => { await save(); await act("issue", "Liquidación emitida"); };
  const pay = async () => {
    const okc = await confirm({ title: "Marcar como pagada", message: `Se registra un egreso "Remuneraciones" de ${formatCurrency(result?.net || 0)} en las finanzas de ${labelOf(month)}.`, confirmText: "Registrar pago", variant: "warning" });
    if (okc) act("pay", "Pago registrado como egreso");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 md:p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-bold text-brand-dark">{d?.name || "Liquidación"} · <span className="capitalize">{labelOf(month)}</span></h2>
            {d && <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS[d.status]?.cls}`}>{STATUS[d.status]?.label}</span>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>

        {err ? (
          <div className="p-6 text-center text-sm text-red-600">{err}
            <div><button onClick={() => { onClose(); goTo("fichas"); }} className="mt-3 rounded-lg border px-3 py-1.5 text-brand-dark">Ir a fichas laborales</button></div>
          </div>
        ) : !d || !inputs || !result ? <div className="p-8"><Spinner /></div> : (
          <div className="space-y-5 p-4">
            {d.params.missing.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                Faltan parámetros del mes: {d.params.missing.join(", ")}. <button className="font-semibold underline" onClick={() => { onClose(); goTo("parametros"); }}>Cargarlos</button>
              </div>
            )}
            {d.params.source && d.params.source !== "tenant" && d.params.missing.length === 0 && (
              <p className="rounded-lg bg-brand-light/70 p-2.5 text-xs text-brand-gray">Parámetros tomados de {d.params.source === "tenant_prev" ? "tu último mes cargado" : d.params.source === "global" ? "los generales" : "los últimos generales"} ({labelOf(String(d.params.paramsMonth).slice(0, 7))}). Revísalos si cambiaron.</p>
            )}

            <fieldset disabled={!!locked || busy} className="space-y-4 disabled:opacity-70">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray">Días y variables</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Num label="Faltas (días)" value={inputs.absentDays} onChange={(n) => set({ absentDays: n })} />
                  <Num label="Licencias (días)" value={inputs.licenseDays} onChange={(n) => set({ licenseDays: n })} />
                  <Num label="Comisiones (libro)" value={inputs.commissions} onChange={(n) => set({ commissions: n })} hint="Del libro de movimientos" />
                  <Num label="Horas extra ($)" value={inputs.overtime} onChange={(n) => set({ overtime: n })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <Num label="Semana corrida ($)" value={inputs.semanaCorrida} onChange={(n) => set({ semanaCorrida: n })} />
                    {d.suggestedSemanaCorrida > 0 && !locked && (
                      <button type="button" className="text-[10px] text-brand-blue underline" onClick={() => set({ semanaCorrida: d.suggestedSemanaCorrida })}>Usar sugerida: {formatCurrency(d.suggestedSemanaCorrida)}</button>
                    )}
                  </div>
                  <label className="block">
                    <span className="block text-[11px] text-brand-gray">Gratificación</span>
                    <select value={inputs.gratification.mode} onChange={(e) => set({ gratification: { ...inputs.gratification, mode: e.target.value as any } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                      <option value="auto">Automática (25% con tope)</option><option value="manual">Manual</option><option value="none">Sin gratificación</option>
                    </select>
                  </label>
                  {inputs.gratification.mode === "manual" && <Num label="Gratificación ($)" value={inputs.gratification.manual || 0} onChange={(n) => set({ gratification: { mode: "manual", manual: n } })} />}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray">Descuentos</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Num label="Quincena / anticipos" value={inputs.advances} onChange={(n) => set({ advances: n })} hint="Del libro" />
                  <Num label="Descuento por planilla" value={inputs.payrollDiscounts} onChange={(n) => set({ payrollDiscounts: n })} hint="Del libro" />
                  <label className="block">
                    <span className="block text-[11px] text-brand-gray">Impuesto (a mano)</span>
                    <input type="number" min={0} value={inputs.taxOverride ?? ""} placeholder={`Auto: ${formatCurrency(result.taxAuto)}`}
                      onChange={(e) => set({ taxOverride: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
                    <span className="block text-[10px] text-gray-400">Vacío = calculado solo</span>
                  </label>
                </div>
              </div>

              <ListEditor title="Otros haberes (bonos)" items={inputs.extraHaberes} onChange={(extraHaberes) => set({ extraHaberes })} haber />
              <ListEditor title="Otros descuentos" items={inputs.otherDiscounts} onChange={(otherDiscounts) => set({ otherDiscounts })}
                presets={[{ label: "Préstamo empresa" }, { label: "Cuota sindical / caja / convenio", legal: true }, { label: "Pensión / retención judicial", legal: true }]} />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray">Pago y constancia</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="block"><span className="block text-[11px] text-brand-gray">Forma de pago</span>
                    <select value={inputs.payment?.method || "transfer"} onChange={(e) => set({ payment: { ...(inputs.payment as any), method: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                      <option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="check">Cheque</option><option value="other">Otro</option></select></label>
                  <label className="block"><span className="block text-[11px] text-brand-gray">Fecha de pago</span>
                    <input type="date" value={inputs.payment?.date || ""} onChange={(e) => set({ payment: { ...(inputs.payment as any), date: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
                  <label className="block"><span className="block text-[11px] text-brand-gray">Banco / medio</span>
                    <input value={inputs.payment?.bank || ""} onChange={(e) => set({ payment: { ...(inputs.payment as any), bank: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
                  <label className="block"><span className="block text-[11px] text-brand-gray">N° comprobante</span>
                    <input value={inputs.payment?.voucher || ""} onChange={(e) => set({ payment: { ...(inputs.payment as any), voucher: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
                  <label className="block sm:col-span-2"><span className="block text-[11px] text-brand-gray">Cuenta / referencia</span>
                    <input value={inputs.payment?.reference || ""} onChange={(e) => set({ payment: { ...(inputs.payment as any), reference: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
                  <label className="block sm:col-span-2"><span className="block text-[11px] text-brand-gray">Observaciones</span>
                    <input value={inputs.payment?.notes || ""} onChange={(e) => set({ payment: { ...(inputs.payment as any), notes: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
                </div>
              </div>
            </fieldset>

            {/* Resultado */}
            <div className="rounded-xl border border-gray-100">
              <div className="grid gap-px bg-gray-100 sm:grid-cols-2">
                <div className="space-y-1 bg-white p-3 text-sm">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-gray">Haberes</p>
                  {result.lines.haberes.map((h, i) => <div key={i} className="flex justify-between"><span className="text-brand-dark">{h.label}</span><span className="tabular-nums text-emerald-600">+{formatCurrency(h.amount)}</span></div>)}
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Total haberes</span><span className="tabular-nums">{formatCurrency(result.totalHaberes)}</span></div>
                </div>
                <div className="space-y-1 bg-white p-3 text-sm">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-gray">Descuentos</p>
                  {result.lines.descuentos.map((x, i) => <div key={i} className="flex justify-between"><span className="text-brand-dark">{x.label}</span><span className="tabular-nums text-red-500">-{formatCurrency(x.amount)}</span></div>)}
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Total descuentos</span><span className="tabular-nums">-{formatCurrency(result.totalDescuentos)}</span></div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 p-3">
                <span className="font-semibold text-brand-dark">Líquido a pagar</span>
                <span className={`text-xl font-bold tabular-nums ${result.net > 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(result.net)}</span>
              </div>
              <p className="px-3 py-2 text-[11px] text-brand-gray">Costo empresa: <b className="text-brand-dark">{formatCurrency(result.totalCost)}</b> (aportes del empleador {formatCurrency(result.employer.total)}: SIS {formatCurrency(result.employer.sis)}, cesantía {formatCurrency(result.employer.afc)}, mutual {formatCurrency(result.employer.mutual)}, reforma {formatCurrency(result.employer.reform)})</p>
            </div>

            {result.warnings.length > 0 && (
              <ul className="space-y-1">
                {result.warnings.map((w, i) => <li key={i} className={`rounded-lg p-2.5 text-xs ${w.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{w.text}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <a href={d.status === "none" ? undefined : `/api/remuneraciones/pdf?barberId=${barberId}&month=${month}`} target="_blank" rel="noreferrer"
                className={`text-sm font-medium ${d.status === "none" ? "pointer-events-none text-gray-300" : "text-brand-blue hover:underline"}`}>Bajar PDF</a>
              <div className="flex flex-wrap gap-2">
                {(d.status === "none" || d.status === "draft") && (
                  <>
                    <button onClick={save} disabled={busy || d.params.missing.length > 0} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-brand-dark disabled:opacity-50">Guardar borrador</button>
                    <button onClick={emit} disabled={busy || d.params.missing.length > 0} className="rounded-xl bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Guardar y emitir</button>
                  </>
                )}
                {d.status === "issued" && (
                  <>
                    <button onClick={() => act("reopen", "Vuelve a borrador")} disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-brand-dark">Reabrir</button>
                    <button onClick={pay} disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Marcar como pagada</button>
                  </>
                )}
                {d.status === "paid" && <span className="text-sm text-emerald-600">Pagada: ya está como egreso en las finanzas.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({ title, items, onChange, haber, presets }: { title: string; items: any[]; onChange: (x: any[]) => void; haber?: boolean; presets?: Array<{ label: string; legal?: boolean }> }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">{title}</p>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {(presets || []).map((pr) => (
            <button key={pr.label} type="button" onClick={() => onChange([...items, { label: pr.label, amount: 0, legal: !!pr.legal }])} className="text-xs font-semibold text-brand-blue hover:underline">+ {pr.label}</button>
          ))}
          <button type="button" onClick={() => onChange([...items, haber ? { label: "", amount: 0, imponible: true, tributable: true } : { label: "", amount: 0, legal: false }])} className="text-xs font-semibold text-brand-blue hover:underline">+ {presets ? "Otro" : "Agregar"}</button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input value={it.label} placeholder="Nombre" onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className="min-w-[8rem] flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
            <input type="number" min={0} value={it.amount} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, amount: Math.max(0, Number(e.target.value) || 0) } : x)))} className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
            {!haber && presets && (
              <label className="flex items-center gap-1 text-[11px] text-brand-gray" title="Los descuentos legales (pensión alimenticia, cuota sindical) no cuentan para el tope de 15%">
                <input type="checkbox" checked={!!it.legal} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, legal: e.target.checked } : x)))} />Legal
              </label>
            )}
            {haber && (
              <>
                <label className="flex items-center gap-1 text-[11px] text-brand-gray"><input type="checkbox" checked={it.imponible} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, imponible: e.target.checked } : x)))} />Imponible</label>
                <label className="flex items-center gap-1 text-[11px] text-brand-gray"><input type="checkbox" checked={it.tributable} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, tributable: e.target.checked } : x)))} />Tributable</label>
              </>
            )}
            <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="text-xs text-red-500">Quitar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Fichas -------------------------------- */

const EMPTY_FILE = { rut: "", position: "", cost_center: "", contract_type: "indefinido", hire_date: "", weekly_hours: 44, base_salary: 0, afp_name: "", afp_rate: 0, health_system: "fonasa", isapre_plan_uf: 0, colacion: 0, movilizacion: 0, gratification_mode: "auto" };

function Fichas() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<any>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; file: any } | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api("/api/remuneraciones/fichas").then(setData).catch(() => setData({ team: [] })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try { await api("/api/remuneraciones/fichas", "PUT", { barberId: edit.id, file: edit.file }); showToast("Ficha guardada", "success"); setEdit(null); load(); }
    catch (e: any) { showToast(e.message, "error"); } finally { setSaving(false); }
  };
  const remove = async (id: string, name: string) => {
    const ok = await confirm({ title: "Quitar ficha laboral", message: `${name} dejará de tener liquidaciones. Las ya guardadas no se borran.`, confirmText: "Quitar", variant: "warning" });
    if (!ok) return;
    await api(`/api/remuneraciones/fichas?barberId=${id}`, "DELETE").catch(() => {}); load();
  };
  const f = edit?.file;
  const setF = (patch: any) => setEdit((e) => (e ? { ...e, file: { ...e.file, ...patch } } : e));

  return (
    <div className="space-y-3">
      {data.migrationMissing && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">Falta aplicar la migración 096 en la base de datos.</p>}
      <p className="text-xs text-brand-gray">Solo los trabajadores <b>con contrato</b> tienen liquidación. Los profesionales que arriendan o van a comisión sin contrato siguen en Comisiones y Arriendo.</p>
      <ul className="divide-y overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {data.team.map((p: any) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div><p className="font-medium text-brand-dark">{p.name}</p><p className="text-xs text-brand-gray">{p.file ? `Contrato ${p.file.contract_type.replace("_", " ")} · base ${formatCurrency(Number(p.file.base_salary))}` : "Sin ficha laboral"}</p></div>
            <div className="flex items-center gap-3">
              {p.file && <button onClick={() => remove(p.id, p.name)} className="text-xs text-red-500 hover:underline">Quitar</button>}
              <button onClick={() => setEdit({ id: p.id, name: p.name, file: p.file ? { ...p.file, rut: p.file.rut || "", position: p.file.position || "", cost_center: p.file.cost_center || "", hire_date: p.file.hire_date || "", isapre_plan_uf: p.file.isapre_plan_uf ?? 0, afp_name: p.file.afp_name || "" } : { ...EMPTY_FILE } })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">{p.file ? "Editar" : "Crear ficha"}</button>
            </div>
          </li>
        ))}
      </ul>

      {edit && f && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 md:p-6">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-bold text-brand-dark">Ficha laboral · {edit.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-[11px] text-brand-gray">RUT</span>
                <input value={f.rut} onChange={(e) => setF({ rut: e.target.value })} placeholder="12.345.678-9" className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
              <label className="block"><span className="block text-[11px] text-brand-gray">Cargo</span>
                <input value={f.position} onChange={(e) => setF({ position: e.target.value })} placeholder="Ej: Barbero" className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
              <label className="block"><span className="block text-[11px] text-brand-gray">Centro de costo (opcional)</span>
                <input value={f.cost_center} onChange={(e) => setF({ cost_center: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
              <span />
              <label className="block"><span className="block text-[11px] text-brand-gray">Contrato</span>
                <select value={f.contract_type} onChange={(e) => setF({ contract_type: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"><option value="indefinido">Indefinido</option><option value="plazo_fijo">Plazo fijo</option><option value="obra">Por obra o faena</option></select></label>
              <label className="block"><span className="block text-[11px] text-brand-gray">Fecha de ingreso</span>
                <input type="date" value={f.hire_date} onChange={(e) => setF({ hire_date: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
              <Num label="Sueldo base mensual ($)" value={Number(f.base_salary)} onChange={(n) => setF({ base_salary: n })} />
              <Num label="Horas semanales" value={Number(f.weekly_hours)} onChange={(n) => setF({ weekly_hours: n })} step={0.5} />
              <label className="block"><span className="block text-[11px] text-brand-gray">AFP</span>
                <input value={f.afp_name} onChange={(e) => setF({ afp_name: e.target.value })} placeholder="Ej: Modelo" className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
              <Num label="% total AFP (con comisión)" value={Number(f.afp_rate)} onChange={(n) => setF({ afp_rate: n })} step={0.01} />
              <label className="block"><span className="block text-[11px] text-brand-gray">Salud</span>
                <select value={f.health_system} onChange={(e) => setF({ health_system: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"><option value="fonasa">Fonasa</option><option value="isapre">Isapre</option></select></label>
              {f.health_system === "isapre" && <Num label="Plan Isapre TOTAL (UF)" value={Number(f.isapre_plan_uf)} onChange={(n) => setF({ isapre_plan_uf: n })} step={0.001} hint="El total del plan, no solo lo adicional" />}
              <Num label="Colación ($)" value={Number(f.colacion)} onChange={(n) => setF({ colacion: n })} />
              <Num label="Movilización ($)" value={Number(f.movilizacion)} onChange={(n) => setF({ movilizacion: n })} />
              <label className="block"><span className="block text-[11px] text-brand-gray">Gratificación</span>
                <select value={f.gratification_mode} onChange={(e) => setF({ gratification_mode: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"><option value="auto">Automática (25% con tope)</option><option value="manual">Manual cada mes</option><option value="none">Sin gratificación</option></select></label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEdit(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="rounded-xl bg-brand-blue px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Parámetros ------------------------------ */

const PARAM_FIELDS: Array<{ key: keyof PayrollParams; label: string; hint?: string; step?: number }> = [
  { key: "uf", label: "Valor UF ($)", step: 0.01 }, { key: "utm", label: "Valor UTM ($)", step: 1 },
  { key: "minWage", label: "Sueldo mínimo ($)" }, { key: "fullTimeHours", label: "Horas semanales jornada completa", step: 0.5 },
  { key: "afpCapUf", label: "Tope imponible AFP / salud (UF)", step: 0.1 }, { key: "afcCapUf", label: "Tope seguro de cesantía (UF)", step: 0.1 },
  { key: "healthRate", label: "Salud legal (%)", step: 0.01 }, { key: "afcWorkerIndef", label: "Cesantía trabajador indefinido (%)", step: 0.01 },
  { key: "sisRate", label: "SIS empleador (%)", step: 0.01 }, { key: "mutualRate", label: "Mutual empleador (%)", step: 0.01 },
  { key: "reformRate", label: "Reforma pensiones empleador (%)", step: 0.01, hint: "Ley 21.735" },
  { key: "afcEmployerIndef", label: "Cesantía empleador indefinido (%)", step: 0.01 }, { key: "afcEmployerFixed", label: "Cesantía empleador plazo fijo/obra (%)", step: 0.01 },
  { key: "gratifCapFactor", label: "Tope gratificación (ingresos mínimos)", step: 0.01, hint: "4,75 anual" },
];

function Parametros({ month }: { month: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [p, setP] = useState<PayrollParams | null>(null);
  const [global, setGlobal] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setData(null);
    api(`/api/remuneraciones/parametros?month=${month}`).then((x) => { setData(x); setP(x.params); }).catch(() => setData({ error: true }));
  }, [month]);
  if (!data) return <Spinner />;
  if (data.error || !p) return <p className="text-sm text-brand-gray">No se pudieron cargar los parámetros.</p>;

  const setBr = (i: number, patch: Partial<TaxBracket>) => setP({ ...p, taxBrackets: p.taxBrackets.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  const save = async () => {
    setSaving(true);
    try { const r = await api("/api/remuneraciones/parametros", "PUT", { month, params: p, global }); showToast(r.missing?.length ? `Guardado. Aún faltan: ${r.missing.join(", ")}` : "Parámetros guardados", r.missing?.length ? "error" : "success"); }
    catch (e: any) { showToast(e.message, "error"); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-light/70 p-3 text-xs text-brand-gray">
        {data.source === "tenant" && <>Parámetros de <b className="capitalize">{labelOf(month)}</b> cargados por ti.</>}
        {data.source === "tenant_prev" && <>Todavía no cargaste {labelOf(month)}: se muestran los de tu último mes ({labelOf(String(data.month).slice(0, 7))}). Corrígelos y guarda.</>}
        {data.source === "global" && <>Se muestran los parámetros generales de {labelOf(month)}. Si los guardas aquí, quedan como los tuyos.</>}
        {data.source === "global_prev" && <>Se muestran los últimos parámetros generales ({labelOf(String(data.month).slice(0, 7))}). Corrígelos y guarda.</>}
        {!data.source && <>Aún no hay parámetros. Cópialos de Previred, SII y la Dirección del Trabajo (ver la Guía). El sistema nunca los inventa.</>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PARAM_FIELDS.map((f) => <Num key={f.key} label={f.label} hint={f.hint} step={f.step} value={Number(p[f.key] as number)} onChange={(n) => setP({ ...p, [f.key]: n })} />)}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">Impuesto único: tramos (en UTM)</p>
          <button onClick={() => setP({ ...p, taxBrackets: [...p.taxBrackets, { fromUtm: 0, toUtm: null, rate: 0, deductUtm: 0 }] })} className="text-xs font-semibold text-brand-blue hover:underline">+ Tramo</button>
        </div>
        <div className="space-y-2">
          {p.taxBrackets.map((b, i) => (
            <div key={i} className="grid grid-cols-5 items-end gap-2">
              <Num label="Desde (UTM)" value={b.fromUtm} step={0.01} onChange={(n) => setBr(i, { fromUtm: n })} />
              <label className="block"><span className="block text-[11px] text-brand-gray">Hasta (UTM)</span>
                <input type="number" min={0} step={0.01} value={b.toUtm ?? ""} placeholder="y más" onChange={(e) => setBr(i, { toUtm: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" /></label>
              <Num label="Factor (%)" value={b.rate} step={0.01} onChange={(n) => setBr(i, { rate: n })} />
              <Num label="Rebaja (UTM)" value={b.deductUtm} step={0.0001} onChange={(n) => setBr(i, { deductUtm: n })} />
              <button onClick={() => setP({ ...p, taxBrackets: p.taxBrackets.filter((_, k) => k !== i) })} className="pb-1.5 text-xs text-red-500">Quitar</button>
            </div>
          ))}
        </div>
      </div>
      {data.isSuper && (
        <label className="flex items-center gap-2 text-sm text-brand-dark"><input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} /> Guardar como parámetros generales (los heredan todos los negocios)</label>
      )}
      <button onClick={save} disabled={saving} className="rounded-xl bg-brand-blue px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : `Guardar parámetros de ${labelOf(month)}`}</button>
    </div>
  );
}

/* -------------------------------- Guía --------------------------------- */

function Guia() {
  const steps = [
    ["Parámetros del mes", "Copia de Previred la UF, UTM, sueldo mínimo, topes imponibles, tasas de SIS, mutual y cesantía, y los tramos del impuesto único (SII). Cárgalos en “Parámetros del mes”."],
    ["Asistencia y licencias", "En cada liquidación anota las faltas y los días de licencia: el sueldo se ajusta solo (30 días base)."],
    ["Comisiones y semana corrida", "Las comisiones vienen del libro de movimientos del mes. Para pago variable, revisa la semana corrida sugerida y confírmala."],
    ["Descuentos", "Quincena y descuentos por planilla vienen del libro. Cualquier otro descuento, agrégalo a mano. El aviso del 15% es solo una advertencia."],
    ["Emitir y pagar", "Guarda, emite y baja el PDF para la firma. Al marcarla como pagada, el líquido entra como egreso “Remuneraciones” en el cierre del mes."],
    ["Cotizaciones en Previred", "Declara y paga las cotizaciones dentro del plazo (el 13 de cada mes si pagas por Previred, o el siguiente día hábil)."],
    ["Libro de Remuneraciones Electrónico", "Si te corresponde, súbelo a la Dirección del Trabajo (LRE). Este sistema no lo envía por ti."],
    ["Guarda las firmas", "Conserva las liquidaciones firmadas por el trabajador."],
  ];
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map(([t, d], i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-xs font-bold text-brand-blue">{i + 1}</span>
            <span><span className="block text-sm font-semibold text-brand-dark">{t}</span><span className="block text-xs text-brand-gray">{d}</span></span>
          </li>
        ))}
      </ol>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Herramienta de apoyo; valida con tu contador. Los cálculos dependen de los parámetros que cargues.</p>
    </div>
  );
}
