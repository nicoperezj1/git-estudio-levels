"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Coins, Wallet, Hourglass, Plus } from "lucide-react";
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
  const [daysFor, setDaysFor] = useState<ProMonth | null>(null);
  const [daysValue, setDaysValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
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

  const saveDays = async () => {
    if (!daysFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profesionales/libro/liquidacion?x=1${tq}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId: daysFor.barberId, month, year, days: daysValue === "" ? null : Number(daysValue) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo guardar", "error"); return; }
      showToast("Días actualizados", "success");
      setDaysFor(null);
      await load();
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

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-brand-gray">
                    <span>{copy.paid}: <b className="tabular-nums text-brand-dark">{formatCurrency(p.paid)}</b></span>
                    <span>{copy.pending}: <b className={`tabular-nums ${p.pending > 0 ? "text-amber-600" : "text-brand-dark"}`}>{formatCurrency(p.pending)}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                        {mode === "rental" && isAdmin && (
                          <button onClick={() => { setDaysFor(p); setDaysValue(String(p.daysWorked ?? "")); }} className="ml-2 text-xs font-semibold text-brand-blue hover:underline">editar días</button>
                        )}
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

      {/* Arriendo: editar dias trabajados */}
      {daysFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDaysFor(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark">Días trabajados</h3>
            <p className="mb-4 text-sm text-brand-gray">{daysFor.name} · automático: {daysFor.autoDays ?? 0} (citas completadas)</p>
            <input type="number" min={0} max={31} step={1} inputMode="numeric" value={daysValue} onChange={(e) => setDaysValue(e.target.value)} className={`${inputClass} tabular-nums`} />
            <p className="mt-1 text-[11px] text-brand-gray">Déjalo vacío para volver al cálculo automático.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDaysFor(null)} className={ghostButton}>Cancelar</button>
              <button onClick={saveDays} disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
