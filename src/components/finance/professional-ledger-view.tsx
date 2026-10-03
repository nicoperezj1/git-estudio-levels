"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Coins, Wallet, Hourglass, Plus } from "lucide-react";
import { formatCurrency, todayInChile } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, StatCard, Panel, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";
import { LEDGER_KINDS, type LedgerKind, type ProMode, type ProMonth } from "@/lib/ledger";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Dice si el negocio tiene encendido el libro (Configuracion). null = todavia no se sabe.
export function useLedgerEnabled(): boolean | null {
  const { tenant, loading } = useTenant();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    let t = tenant?.id || "";
    if (!t) { try { t = JSON.parse(localStorage.getItem("tenant_override") || "{}").tenantId || ""; } catch {} }
    fetch(`/api/settings/pro-ledger${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json()).then((d) => setEnabled(!!d.enabled)).catch(() => setEnabled(false));
  }, [loading, tenant?.id]);
  return enabled;
}

const COPY: Record<ProMode, { title: string; subtitle: string; total: string; paid: string; pending: string; owedHint: string }> = {
  commission: { title: "Comisiones", subtitle: "Lo que el negocio le paga a cada profesional este mes.", total: "A pagar a los profesionales", paid: "Pagado", pending: "Pendiente", owedHint: "El profesional debe al negocio" },
  rental: { title: "Arriendo", subtitle: "Lo que cada profesional le paga al negocio este mes.", total: "A cobrar a los profesionales", paid: "Cobrado", pending: "Pendiente", owedHint: "El negocio le debe al profesional" },
};

export function ProfessionalLedgerView({ mode }: { mode: ProMode }) {
  const copy = COPY[mode];
  const [cy, cm] = todayInChile().split("-").map(Number);
  const [month, setMonth] = useState(cm);
  const [year, setYear] = useState(cy);
  const [items, setItems] = useState<ProMonth[]>([]);
  const [totals, setTotals] = useState({ total: 0, paid: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant } = useTenant();
  const { isAtLeast } = useAuth();
  const isAdmin = isAtLeast("admin");
  const tq = tenant?.id ? `&tenantId=${tenant.id}` : "";

  // Modales
  const [addFor, setAddFor] = useState<ProMonth | null>(null);
  const [form, setForm] = useState({ kind: "money_in_favor" as LedgerKind, effect: "1", amount: "", reason: "" });
  const [payFor, setPayFor] = useState<ProMonth | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", note: "" });
  const [payLog, setPayLog] = useState<Array<{ old_amount: number | null; new_amount: number; note: string | null; user_name: string | null; created_at: string }>>([]);
  const [calFor, setCalFor] = useState<ProMonth | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/profesionales/libro?mode=${mode}&month=${month}&year=${year}${tq}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotals(data.totals || { total: 0, paid: 0, pending: 0 });
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [month, year, tenant?.id, mode]);

  const changeMonth = (d: number) => {
    let m = month + d, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  const kinds = (Object.keys(LEDGER_KINDS) as LedgerKind[]).filter((k) => !(mode === "rental" && k === "advance"));

  const saveMovement = async () => {
    if (!addFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profesionales/libro/movimientos?x=1${tq}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: addFor.barberId, month, year, kind: form.kind, effect: Number(form.effect), amount: Number(form.amount), reason: form.reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo guardar el movimiento", "error"); return; }
      showToast("Movimiento agregado", "success");
      setAddFor(null);
      setForm({ kind: "money_in_favor", effect: "1", amount: "", reason: "" });
      await load();
    } finally { setBusy(false); }
  };

  const cancelMovement = async (id: string) => {
    const ok = await confirm({ title: "Anular movimiento", message: "El movimiento deja de contar en el total. Queda registrado como anulado.", confirmText: "Anular", variant: "warning" });
    if (!ok) return;
    const res = await fetch(`/api/profesionales/libro/movimientos?id=${id}${tq}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo anular", "error"); return; }
    showToast("Movimiento anulado", "success");
    await load();
  };

  const openPay = async (p: ProMonth) => {
    setPayFor(p);
    setPayForm({ amount: String(p.paid || ""), note: "" });
    setPayLog([]);
    const res = await fetch(`/api/profesionales/libro/liquidacion?barberId=${p.barberId}&month=${month}&year=${year}&mode=${mode}${tq}`);
    const data = await res.json().catch(() => ({}));
    setPayLog(data.log || []);
  };
  const savePay = async () => {
    if (!payFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: payFor.barberId, month, year, mode, amount: Number(payForm.amount) || 0, note: payForm.note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo guardar", "error"); return; }
      showToast(`${copy.paid} actualizado`, "success");
      setPayFor(null);
      await load();
    } finally { setBusy(false); }
  };

  // Dias trabajados: la pantalla se actualiza AL INSTANTE (la cuenta es simple: dias x valor) y el guardado ocurre solo,
  // medio segundo despues del ultimo cambio. Asi se puede tocar + / − o escribir el numero sin esperar al servidor.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef(0);
  const setDaysQuick = (p: ProMonth, raw: number) => {
    const n = Math.min(31, Math.max(0, Math.round(raw) || 0));
    setItems((prev) => {
      const next = prev.map((i) => {
        if (i.barberId !== p.barberId) return i;
        const base = n * (i.dailyRate ?? 0);
        const total = base - i.adjustments;
        return {
          ...i, daysWorked: n, daysSource: "manual" as const, workedDates: null, base, total, pending: total - i.paid,
          baseLabel: `Arriendo: ${n} día${n === 1 ? "" : "s"} × ${(i.dailyRate ?? 0).toLocaleString("es-CL")}`,
        };
      });
      setTotals({ total: next.reduce((a, i) => a + i.total, 0), paid: next.reduce((a, i) => a + i.paid, 0), pending: next.reduce((a, i) => a + i.pending, 0) });
      return next;
    });
    clearTimeout(timers.current[p.barberId]);
    timers.current[p.barberId] = setTimeout(async () => {
      delete timers.current[p.barberId];
      inflight.current++;
      try {
        const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barberId: p.barberId, month, year, days: n }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || "No se pudieron guardar los días", "error");
          await load(true);
        }
      } finally {
        inflight.current--;
      }
    }, 500);
  };

  // Valor del dia de ESTE mes: mismo criterio, se ve al instante y se guarda solo.
  const setRateQuick = (p: ProMonth, raw: number) => {
    const n = Math.min(10_000_000, Math.max(0, Math.round(raw) || 0));
    setItems((prev) => {
      const next = prev.map((i) => {
        if (i.barberId !== p.barberId) return i;
        const days = i.daysWorked ?? 0;
        const base = days * n;
        const total = base - i.adjustments;
        return {
          ...i, dailyRate: n, rateOverride: n !== i.profileDailyRate, base, total, pending: total - i.paid,
          baseLabel: `Arriendo: ${days} día${days === 1 ? "" : "s"} × ${n.toLocaleString("es-CL")}`,
        };
      });
      setTotals({ total: next.reduce((a, i) => a + i.total, 0), paid: next.reduce((a, i) => a + i.paid, 0), pending: next.reduce((a, i) => a + i.pending, 0) });
      return next;
    });
    const key = `rate-${p.barberId}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      delete timers.current[key];
      const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: p.barberId, month, year, dailyRate: n }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "No se pudo guardar el valor del día", "error");
        await load(true);
      }
    }, 500);
  };
  const resetRate = async (p: ProMonth) => {
    const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId: p.barberId, month, year, dailyRate: null }),
    });
    if (!res.ok) { showToast("No se pudo guardar", "error"); return; }
    await load(true);
  };
  // Deja el valor cambiado como el valor habitual del profesional (su ficha) para los proximos meses.
  const makeRateUsual = async (p: ProMonth) => {
    const ok = await confirm({
      title: "Cambiar el valor habitual",
      message: `El valor del día de ${p.name} pasará a ${formatCurrency(p.dailyRate ?? 0)} desde ahora. Los meses que ya cerraste con otro valor no cambian si lo corregiste en ellos.`,
      confirmText: "Dejar como habitual", variant: "warning",
    });
    if (!ok) return;
    const r1 = await fetch(`/api/barberos/${p.barberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rental_daily_rate: p.dailyRate }) });
    if (!r1.ok) { showToast("No se pudo cambiar el valor habitual", "error"); return; }
    await resetRate(p);
    showToast("Valor habitual actualizado", "success");
  };

  // Arriendo: guarda los dias trabajados. `body` = { days } (solo la cantidad), { dates } (calendario) o {} (automatico).
  const patchDays = async (p: ProMonth, body: { days?: number; dates?: string[]; auto?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: p.barberId, month, year, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo guardar", "error"); return false; }
      await load();
      return true;
    } finally { setBusy(false); }
  };

  const money = (n: number) => formatCurrency(Math.abs(n));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8 animate-fade-in">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div className="flex items-center gap-1 rounded-2xl border border-gray-100 bg-brand-light p-1">
            <button onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-gray hover:bg-white hover:text-brand-blue">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-bold text-brand-dark">{MONTHS[month - 1]} {year}</span>
            <button onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-gray hover:bg-white hover:text-brand-blue">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* De lo mas grande a lo mas pequeño: total, lo ya pagado/cobrado, lo pendiente. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard hero label={copy.total} value={formatCurrency(totals.total)} Icon={Coins} className="md:col-span-1" />
        <StatCard label={copy.paid} value={formatCurrency(totals.paid)} Icon={Wallet} tone="green" />
        <StatCard label={copy.pending} value={formatCurrency(totals.pending)} Icon={Hourglass} tone="amber" />
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Panel><p className="py-8 text-center text-sm text-brand-gray">No hay profesionales en esta modalidad.</p></Panel>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const open = openId === p.barberId;
            return (
              <Panel key={p.barberId}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-brand-dark">{p.name}</p>
                    <p className="text-xs text-brand-gray">{p.baseLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold tabular-nums text-brand-dark">{money(p.total)}</p>
                    <p className="text-[11px] text-brand-gray">{p.total < 0 ? copy.owedHint : mode === "commission" ? "a pagar" : "a cobrar"}</p>
                  </div>
                </div>

                {mode === "rental" && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-light/70 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-brand-dark">Días trabajados</p>
                      <p className="text-[11px] text-brand-gray">
                        {p.daysSource === "calendar" ? "Elegidos en el calendario" : p.daysSource === "manual" ? `Corregido a mano (automático: ${p.autoDays ?? 0})` : "Automático (citas completadas)"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <>
                          <button type="button" disabled={(p.daysWorked ?? 0) <= 0} onClick={() => setDaysQuick(p, (p.daysWorked ?? 0) - 1)}
                            aria-label="Un día menos" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-brand-dark hover:border-brand-blue disabled:opacity-40">−</button>
                          <input type="number" min={0} max={31} step={1} inputMode="numeric" value={p.daysWorked ?? 0} aria-label="Días trabajados"
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setDaysQuick(p, e.target.value === "" ? 0 : Number(e.target.value))}
                            className="h-9 w-16 rounded-lg border border-gray-200 bg-white text-center text-lg font-extrabold tabular-nums text-brand-dark outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10" />
                          <button type="button" disabled={(p.daysWorked ?? 0) >= 31} onClick={() => setDaysQuick(p, (p.daysWorked ?? 0) + 1)}
                            aria-label="Un día más" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-brand-dark hover:border-brand-blue disabled:opacity-40">+</button>
                        </>
                      ) : (
                        <span className="min-w-[2ch] text-center text-xl font-extrabold tabular-nums text-brand-dark">{p.daysWorked ?? 0}</span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-brand-gray">
                        ×
                        {isAdmin ? (
                          <span className="flex items-center rounded-lg border border-gray-200 bg-white px-2 focus-within:border-brand-blue">
                            <span className="text-brand-gray">$</span>
                            <input type="number" min={0} step={500} inputMode="numeric" value={p.dailyRate ?? 0} aria-label="Valor del día"
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setRateQuick(p, e.target.value === "" ? 0 : Number(e.target.value))}
                              className="h-8 w-20 bg-transparent text-right text-sm font-semibold tabular-nums text-brand-dark outline-none" />
                          </span>
                        ) : formatCurrency(p.dailyRate ?? 0)}
                        = <b className="text-sm text-brand-dark">{formatCurrency(p.base)}</b>
                      </span>
                      {isAdmin && (
                        <button type="button" onClick={() => setCalFor(p)} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>
                          <CalendarDays className="h-3.5 w-3.5" /> Calendario
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {mode === "rental" && p.rateOverride && (
                  <p className="mt-1.5 px-1 text-[11px] text-amber-700">
                    Valor del día cambiado solo para este mes (habitual: {formatCurrency(p.profileDailyRate ?? 0)}).
                    {isAdmin && (
                      <>
                        {" "}<button type="button" onClick={() => makeRateUsual(p)} className="font-semibold underline">Dejarlo como habitual</button>
                        {" · "}<button type="button" onClick={() => resetRate(p)} className="font-semibold underline">Volver al habitual</button>
                      </>
                    )}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-brand-gray">
                    <span>{copy.paid}: <b className="tabular-nums text-brand-dark">{formatCurrency(p.paid)}</b></span>
                    <span>{copy.pending}: <b className={`tabular-nums ${p.pending > 0 ? "text-amber-600" : "text-brand-dark"}`}>{formatCurrency(p.pending)}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/profesionales/libro/recibo?barberId=${p.barberId}&mode=${mode}&month=${month}&year=${year}${tq}`}
                      target="_blank" rel="noopener"
                      className={`${ghostButton} !px-3 !py-1.5 text-xs`}
                    >
                      Recibo PDF
                    </a>
                    <button onClick={() => setOpenId(open ? null : p.barberId)} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>
                      Detalle <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => { setAddFor(p); setForm({ kind: "money_in_favor", effect: "1", amount: "", reason: "" }); }} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>
                          <Plus className="h-3.5 w-3.5" /> Agregar movimiento
                        </button>
                        <button onClick={() => openPay(p)} className={`${primaryButton} !px-3 !py-1.5 text-xs`}>
                          Editar {copy.paid.toLowerCase()}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="mt-3 divide-y divide-gray-100 rounded-xl bg-brand-light/60 px-4">
                    <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="text-brand-dark">
                        {p.baseLabel}
                      </span>
                      <span className="font-semibold tabular-nums text-brand-dark">{formatCurrency(p.base)}</span>
                    </div>
                    {p.lines.length === 0 && <p className="py-2.5 text-xs text-brand-gray">Sin otros movimientos este mes.</p>}
                    {p.lines.map((l) => {
                      // Verde = suma al profesional, rojo = le descuenta.
                      const good = l.effect === 1;
                      return (
                        <div key={l.key} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                          <span className="min-w-0 text-brand-dark">
                            {l.label}
                            {l.reason && <span className="block truncate text-[11px] text-brand-gray">{l.reason}{l.by ? ` · ${l.by}` : ""}</span>}
                            {l.source === "ledger" && isAdmin && l.ledgerId && (
                              <button onClick={() => cancelMovement(l.ledgerId!)} className="text-[11px] font-semibold text-red-500 hover:underline">anular</button>
                            )}
                          </span>
                          <span className={`shrink-0 font-semibold tabular-nums ${good ? "text-emerald-600" : "text-red-500"}`}>
                            {good ? "+" : "−"}{formatCurrency(l.amount)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="font-bold text-brand-dark">{p.total < 0 ? copy.owedHint : mode === "commission" ? "Total a pagar" : "Total a cobrar"}</span>
                      <span className="text-base font-extrabold tabular-nums text-brand-dark">{money(p.total)}</span>
                    </div>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {/* Agregar movimiento */}
      {addFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAddFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark">Agregar movimiento</h3>
            <p className="mb-4 text-sm text-brand-gray">{addFor.name} · {MONTHS[month - 1]} {year}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Tipo</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LedgerKind })} className={inputClass}>
                  {kinds.map((k) => <option key={k} value={k}>{LEDGER_KINDS[k].label}</option>)}
                </select>
              </div>
              {form.kind === "manual" ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-brand-gray">¿Cómo afecta al profesional?</label>
                  <select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })} className={inputClass}>
                    <option value="1">A su favor (suma al profesional)</option>
                    <option value="-1">En su contra (descuenta al profesional)</option>
                  </select>
                </div>
              ) : (
                <p className={`rounded-xl px-3 py-2 text-xs ${LEDGER_KINDS[form.kind].effect === 1 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  {LEDGER_KINDS[form.kind].effect === 1 ? "Suma al profesional (a su favor)." : "Descuenta al profesional."}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Monto ($)</label>
                <input type="number" min={1} step={1} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputClass} tabular-nums`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Motivo *</label>
                <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ej: pidió adelanto, compró shampoo…" className={inputClass} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAddFor(null)} className={ghostButton}>Cancelar</button>
              <button onClick={saveMovement} disabled={busy || !form.amount || Number(form.amount) <= 0 || !form.reason.trim()} className={primaryButton}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar pagado / cobrado */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPayFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark">Editar {copy.paid.toLowerCase()}</h3>
            <p className="mb-4 text-sm text-brand-gray">{payFor.name} · total del mes {money(payFor.total)}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Monto {copy.paid.toLowerCase()} ($)</label>
                <input type="number" min={0} step={1} inputMode="numeric" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className={`${inputClass} tabular-nums`} />
                <button type="button" onClick={() => setPayForm({ ...payForm, amount: String(Math.max(0, payFor.total)) })} className="mt-1 text-xs font-semibold text-brand-blue hover:underline">
                  Usar el total del mes
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Nota (opcional)</label>
                <input type="text" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} className={inputClass} />
              </div>
              {payLog.length > 0 && (
                <div className="rounded-xl bg-brand-light p-3">
                  <p className="mb-1 text-xs font-semibold text-brand-gray">Registro de cambios</p>
                  <ul className="space-y-1 text-xs text-brand-dark">
                    {payLog.map((l, i) => (
                      <li key={i}>
                        {l.old_amount === null ? "Se registró" : `De ${formatCurrency(l.old_amount)} a`} {formatCurrency(l.new_amount)} · {l.user_name || "—"} ·{" "}
                        {new Date(l.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}
                        {l.note ? ` · ${l.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className={ghostButton}>Cancelar</button>
              <button onClick={savePay} disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Arriendo: calendario del mes para elegir los dias trabajados */}
      {calFor && (
        <DaysCalendarModal
          pro={calFor} year={year} month={month} busy={busy} onClose={() => setCalFor(null)}
          onSave={async (dates) => { if (await patchDays(calFor, { dates })) { showToast("Días actualizados", "success"); setCalFor(null); } }}
          onAuto={async () => { if (await patchDays(calFor, { auto: true })) { showToast("Volvió al cálculo automático", "success"); setCalFor(null); } }}
        />
      )}
    </div>
  );
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// Calendario del mes para elegir los dias trabajados de un profesional en arriendo. Los dias libres del profesional
// (segun su horario) salen de otro color pero se pueden elegir igual, por si hubo un cambio de dia. Un punto verde marca
// los dias con citas completadas.
function DaysCalendarModal({ pro, year, month, busy, onClose, onSave, onAuto }: {
  pro: ProMonth; year: number; month: number; busy: boolean;
  onClose: () => void; onSave: (dates: string[]) => void; onAuto: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pro.workedDates ?? pro.autoDates ?? []));
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // semana desde el lunes
  const iso = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isOff = (d: number) => (pro.offWeekdays || []).includes(new Date(Date.UTC(year, month - 1, d)).getUTCDay());
  const toggle = (d: number) => setSelected((prev) => { const n = new Set(prev); const k = iso(d); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const rate = pro.dailyRate ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-brand-dark">Días trabajados</h3>
        <p className="mb-4 text-sm text-brand-gray">{pro.name} · {MONTHS[month - 1]} {year}</p>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w, i) => <div key={i} className="pb-1 text-center text-[11px] font-semibold text-brand-gray">{w}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const d = i + 1, k = iso(d), sel = selected.has(k), off = isOff(d), appt = (pro.autoDates || []).includes(k);
            const cls = sel
              ? `bg-brand-blue text-white border-brand-blue ${off ? "ring-2 ring-amber-300" : ""}`
              : off ? "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400"
              : "bg-white text-brand-dark border-gray-200 hover:border-brand-blue/60";
            return (
              <button key={k} type="button" onClick={() => toggle(d)} aria-pressed={sel}
                aria-label={`${d} de ${MONTHS[month - 1]}${off ? ", día libre del profesional" : ""}${sel ? ", seleccionado" : ""}`}
                className={`relative flex h-11 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-colors ${cls}`}>
                {d}
                {appt && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${sel ? "bg-white" : "bg-emerald-500"}`} />}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-gray">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-blue" /> Trabajó (se cobra)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Día libre del profesional (se puede elegir igual)</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Con citas</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(new Set(pro.autoDates || []))} className="text-xs font-semibold text-brand-blue hover:underline">Días con citas</button>
          <button type="button" onClick={() => setSelected(new Set(Array.from({ length: dim }, (_, i) => i + 1).filter((d) => !isOff(d)).map(iso)))} className="text-xs font-semibold text-brand-blue hover:underline">Todos sus días de trabajo</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-brand-blue hover:underline">Limpiar</button>
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-brand-light/70 px-4 py-3">
          <span className="text-sm text-brand-dark"><b className="text-lg tabular-nums">{selected.size}</b> día{selected.size === 1 ? "" : "s"} × {formatCurrency(rate)}</span>
          <span className="text-lg font-extrabold tabular-nums text-brand-dark">{formatCurrency(selected.size * rate)}</span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onAuto} disabled={busy} className="text-xs font-semibold text-brand-gray hover:text-brand-dark hover:underline">Volver a automático</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={ghostButton}>Cancelar</button>
            <button type="button" onClick={() => onSave(Array.from(selected))} disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
