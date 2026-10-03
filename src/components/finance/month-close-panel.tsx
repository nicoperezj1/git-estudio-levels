"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Lock, Unlock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Panel, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface FixedItem { key: string; label: string; amount: number }
interface CloseLog { action: "close" | "reopen"; user_name: string | null; created_at: string }

// Gastos del mes + cerrar / reabrir el mes. Solo administrador (el servidor tambien lo exige).
// Los gastos del mes se ingresan desde cero cada mes y se guardan como egresos, asi que aparecen en
// Ingresos y egresos, en el cierre mensual y en los informes.
export function MonthClosePanel({ month, year, onChanged }: { month: number; year: number; onChanged: () => void }) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const monthName = `${MONTHS[month - 1]} ${year}`;
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant } = useTenant();
  const tq = tenant?.id ? `&tenantId=${tenant.id}` : "";

  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [items, setItems] = useState<FixedItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [machine, setMachine] = useState<{ debit: number; credit: number } | null>(null);
  const [closed, setClosed] = useState(false);
  const [log, setLog] = useState<CloseLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(true);
  // Burbuja de ayuda de "Comision maquina": se abre con el mouse encima o al tocar el icono, y se cierra
  // al sacar el mouse o tocar fuera.
  const [tip, setTip] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!tip) return;
    const close = (e: Event) => { if (!tipRef.current?.contains(e.target as Node)) setTip(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tip]);

  const load = async () => {
    setLoading(true);
    try {
      const [fx, cl] = await Promise.all([
        fetch(`/api/finanzas/gastos-fijos?month=${ym}${tq}`).then((r) => r.json()),
        fetch(`/api/finanzas/cierre?month=${ym}${tq}`).then((r) => r.json()),
      ]);
      setAvailable(fx.available !== false && cl.available !== false);
      setItems(fx.items || []);
      setValues(Object.fromEntries((fx.items || []).map((i: FixedItem) => [i.key, i.amount ? String(i.amount) : ""])));
      setMachine(fx.machine || null);
      setClosed(!!cl.closed || !!fx.closed);
      setLog(cl.log || []);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [ym, tenant?.id]);

  const total = items.reduce((s, i) => s + (Number(values[i.key]) || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/finanzas/gastos-fijos?x=1${tq}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: ym, items: items.map((i) => ({ category: i.key, amount: Number(values[i.key]) || 0 })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudieron guardar los gastos del mes", "error"); return; }
      showToast("Gastos del mes guardados", "success");
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const toggleClose = async () => {
    const closing = !closed;
    const ok = await confirm({
      title: closing ? `Cerrar ${monthName}` : `Reabrir ${monthName}`,
      message: closing
        ? "Al cerrar el mes no se podrán registrar, editar ni anular movimientos manuales de ese mes, ni cambiar sus gastos del mes. Podrás reabrirlo cuando quieras."
        : "Al reabrir el mes se podrán volver a registrar y editar movimientos de ese mes. Queda anotado quién lo reabrió.",
      confirmText: closing ? "Cerrar mes" : "Reabrir mes",
      variant: "warning",
    });
    if (!ok) return;
    const res = await fetch(`/api/finanzas/cierre?x=1${tq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: ym, action: closing ? "close" : "reopen" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || "No se pudo cambiar el estado del mes", "error"); return; }
    showToast(closing ? "Mes cerrado" : "Mes reabierto", "success");
    await load();
  };

  return (
    <Panel
      title={`Gastos del mes y cierre · ${monthName}`}
      subtitle="Se ingresan desde cero cada mes y se suman a los egresos."
      action={
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${closed ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
          {closed ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {closed ? "Mes cerrado" : "Mes abierto"}
        </span>
      }
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-brand-gray">Cargando…</p>
      ) : !available ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
          Esta sección necesita una actualización de la base de datos (migración 090) que todavía no está aplicada.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-brand-gray">Total gastos del mes: <span className="text-base font-bold text-brand-dark tabular-nums">{formatCurrency(total)}</span></p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOpen(!open)} className={ghostButton}>
                {open ? "Ocultar detalle" : closed ? "Ver gastos del mes" : "Editar gastos del mes"}
              </button>
              <button onClick={toggleClose} className={ghostButton}>
                {closed ? "Reabrir mes" : "Cerrar mes"}
              </button>
            </div>
          </div>

          {open && (
            <>
              {/* Lista que baja: un gasto por fila (concepto a la izquierda, monto a la derecha). */}
              <div className="divide-y divide-gray-100">
                {items.map((i) => (
                  <div key={i.key} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <label htmlFor={`fx-${i.key}`} className="text-sm text-brand-dark">{i.label}</label>
                        {i.key === "machine_commission" && machine && (
                          // Ayuda escondida: se ve al pasar el mouse (computador) o al tocar el ícono (celular).
                          <span
                            ref={tipRef}
                            className="relative inline-flex"
                            onMouseEnter={() => setTip(true)}
                            onMouseLeave={() => setTip(false)}
                          >
                            <button
                              type="button"
                              aria-label="Ver detalle de ventas con tarjeta"
                              onClick={() => setTip(true)}
                              onFocus={() => setTip(true)}
                              onBlur={() => setTip(false)}
                              className="text-brand-gray/70 outline-none transition-colors hover:text-brand-blue focus:text-brand-blue"
                            >
                              <Info className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                            {tip && (
                              <span role="tooltip" className="pointer-events-none absolute left-0 top-6 z-20 w-64 rounded-xl border border-gray-100 bg-white p-3 text-xs leading-snug text-brand-dark shadow-xl">
                                Este mes se vendió <b>{formatCurrency(machine.debit)}</b> con débito y <b>{formatCurrency(machine.credit)}</b> con crédito. Ingresa el monto real que cobró la máquina.
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <div className="flex w-40 shrink-0 items-center gap-1.5">
                        <span className="text-sm text-brand-gray">$</span>
                        <input
                          id={`fx-${i.key}`}
                          type="number" min={0} step={1} inputMode="numeric" placeholder="0"
                          disabled={closed}
                          value={values[i.key] ?? ""}
                          onChange={(e) => setValues({ ...values, [i.key]: e.target.value })}
                          className={`${inputClass} !rounded-xl !py-1.5 tabular-nums text-right disabled:opacity-60`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={save} disabled={saving || closed} className={`${primaryButton} disabled:opacity-50`}>
                  {saving ? "Guardando…" : "Guardar gastos del mes"}
                </button>
              </div>
            </>
          )}

          {log.length > 0 && (
            <div className="rounded-xl bg-brand-light p-3">
              <p className="mb-1.5 text-xs font-semibold text-brand-gray">Registro de cambios</p>
              <ul className="space-y-1 text-xs text-brand-dark">
                {log.map((l, idx) => (
                  <li key={idx}>
                    {l.action === "close" ? "Cerrado" : "Reabierto"} por {l.user_name || "—"} ·{" "}
                    {new Date(l.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
