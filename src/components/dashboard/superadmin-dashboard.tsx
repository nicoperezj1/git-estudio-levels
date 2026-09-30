"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, CheckCircle2, Hourglass, PauseCircle, TrendingUp, Users, CalendarDays,
  Receipt, Scissors, MapPin, AlertTriangle, Trophy, Wallet, Store,
} from "lucide-react";
import { PageHeader, StatCard, Panel, ghostButton, tableStyles } from "@/components/ui/premium";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";

// Dashboard exclusivo del Super Admin (Nico, 29-sep): en vez de mostrar las ventas de un
// negocio, muestra la plataforma completa — empresas, planes, ciudades, ingresos de
// re-booking, volumen que mueven los negocios y comision de cada pasarela.

interface Overview {
  tenants: { total: number; active: number; trial: number; suspended: number; cancelled: number; newThisMonth: number; newPrevMonth: number; cancelledThisMonth: number };
  revenue: { mrr: number; arr: number };
  byPlan: Array<{ plan: string; name: string; count: number; active: number; mrr: number }>;
  byCity: Array<{ city: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  platform: { professionals: number; clients: number; appointmentsMonth: number; volume: number; prevVolume: number; sales: number };
  byMethod: Array<{ method: string; total: number }>;
  subscriptionGateways: Array<{ gateway: string; label: string; count: number; mrr: number; feePct: number | null; estimatedFee: number | null }>;
  volumeGateways: Array<{ gateway: string; label: string; volume: number; count: number; feePct: number | null; estimatedFee: number | null }>;
  topTenants: Array<{ id: string; name: string; city: string; plan: string; total: number; count: number }>;
  idleTenants: Array<{ id: string; name: string; plan: string; city: string }>;
  trialsEnding: Array<{ id: string; name: string; plan: string; city: string; daysLeft: number }>;
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo", debit_card: "Débito", credit_card: "Crédito", transfer: "Transferencia", mixed: "Mixto",
};

function Bars({ rows, tone = "bg-brand-blue" }: { rows: Array<{ label: string; value: number; right?: string }>; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-brand-gray">Sin datos todavía</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-brand-dark">{r.label}</span>
            <span className="flex-shrink-0 tabular-nums text-brand-gray">{r.right ?? r.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Comision editable: se guarda al salir del campo o con Enter. Vacio = sin configurar.
function FeeInput({ gateway, value, onSaved }: { gateway: string; value: number | null; onSaved: () => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);

  const save = async () => {
    const current = value == null ? "" : String(value);
    if (text.trim() === current) return;
    setSaving(true);
    try {
      await fetch("/api/superadmin/gateway-fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway, fee_pct: text.trim() === "" ? null : text }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={text}
        inputMode="decimal"
        placeholder="definir"
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-16 rounded-lg border border-black/10 bg-transparent px-2 py-1 text-right text-sm tabular-nums text-brand-dark outline-none focus:border-brand-blue dark:border-white/15"
      />
      <span className="text-brand-gray">%</span>
    </span>
  );
}

export function SuperAdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch("/api/superadmin/overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setError(false); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return <div className="p-6 text-sm text-brand-gray">No se pudo cargar el panel de plataforma. Recarga la página.</div>;
  }
  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" /></div>;
  }

  const t = data.tenants;
  const catLabel = (v: string) => BUSINESS_CATEGORIES.find((c) => c.value === v)?.label || "Sin clasificar";
  const volumeDelta = data.platform.prevVolume > 0
    ? Math.round(((data.platform.volume - data.platform.prevVolume) / data.platform.prevVolume) * 100)
    : null;
  const totalMethod = data.byMethod.reduce((s, m) => s + m.total, 0);

  return (
    <div className="animate-fade-in space-y-6 p-4 md:p-6">
      <PageHeader
        title="Panel de plataforma"
        subtitle="Vista global de re-booking: todas las empresas, planes, ingresos y pasarelas"
        actions={<Link href="/dashboard/superadmin/tenants" className={ghostButton}><Building2 className="h-4 w-4" strokeWidth={1.75} /> Ver empresas</Link>}
      />

      {/* Indicadores principales */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard hero className="col-span-2 lg:col-span-1" label="Ingresos recurrentes / mes" value={clp(data.revenue.mrr)} hint={`${clp(data.revenue.arr)} proyectado al año`} Icon={TrendingUp} />
        <StatCard label="Empresas" value={t.total} hint={`+${t.newThisMonth} este mes${t.newPrevMonth ? ` · ${t.newPrevMonth} el mes pasado` : ""}`} Icon={Building2} tone="teal" />
        <StatCard label="Activas" value={t.active} hint={`${pct(t.active, t.total)}% del total`} Icon={CheckCircle2} tone="green" />
        <StatCard label="En prueba" value={t.trial} hint="Aún sin plan pagado" Icon={Hourglass} tone="amber" />
        <StatCard label="Suspendidas / canceladas" value={t.suspended + t.cancelled} hint={t.cancelledThisMonth ? `${t.cancelledThisMonth} cancelación este mes` : "Sin cancelaciones este mes"} Icon={PauseCircle} tone="red" />
      </div>

      {/* Planes y ciudades */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Empresas por plan" subtitle="Cuántas tiene cada plan y cuánto aporta cada uno al mes">
          <div className="px-5 pb-5">
            <Bars
              rows={data.byPlan.map((p) => ({
                label: `${p.name}`,
                value: p.count,
                right: `${p.count} empresas · ${p.active} activas · ${clp(p.mrr)}/mes`,
              }))}
            />
          </div>
        </Panel>
        <Panel title="Empresas por ciudad" subtitle="Dónde está tu base de clientes">
          <div className="px-5 pb-5">
            <Bars
              tone="bg-emerald-500"
              rows={data.byCity.slice(0, 8).map((c) => ({ label: c.city, value: c.count, right: `${c.count} · ${pct(c.count, t.total)}%` }))}
            />
            {data.byCity.some((c) => c.city === "Sin definir") && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-brand-gray">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} /> "Sin definir": completa la ciudad al crear o editar la empresa.
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* Uso de la plataforma */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Profesionales" value={data.platform.professionals} Icon={Scissors} tone="violet" />
        <StatCard label="Clientes registrados" value={data.platform.clients.toLocaleString("es-CL")} Icon={Users} tone="teal" />
        <StatCard label="Citas del mes" value={data.platform.appointmentsMonth.toLocaleString("es-CL")} Icon={CalendarDays} tone="slate" />
        <StatCard label="Ventas del mes" value={data.platform.sales.toLocaleString("es-CL")} Icon={Receipt} tone="amber" />
        <StatCard label="Volumen vendido" value={clp(data.platform.volume)} hint="Lo que venden todos los negocios" Icon={Wallet} tone="green" delta={volumeDelta === null ? undefined : { value: volumeDelta, suffix: "vs mes anterior" }} />
      </div>

      {/* Pasarelas */}
      <Panel title="Ingresos por pasarela de pago" subtitle="La comisión (%) se ingresa una vez y se usa para estimar lo que se lleva cada pasarela">
        <div className="grid gap-6 px-5 pb-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-gray">Suscripciones a re-booking (mensual)</p>
            <div className="overflow-x-auto">
              <table className={tableStyles.table}>
                <thead className={tableStyles.thead}>
                  <tr>
                    <th className={tableStyles.th}>Pasarela</th>
                    <th className={`${tableStyles.th} text-right`}>Empresas</th>
                    <th className={`${tableStyles.th} text-right`}>Ingreso</th>
                    <th className={`${tableStyles.th} text-right`}>Comisión</th>
                    <th className={`${tableStyles.th} text-right`}>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptionGateways.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-brand-gray">Aún no hay suscripciones activas</td></tr>
                  )}
                  {data.subscriptionGateways.map((g) => (
                    <tr key={g.gateway} className={tableStyles.tr}>
                      <td className={`${tableStyles.td} font-medium`}>{g.label}</td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{g.count}</td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{clp(g.mrr)}</td>
                      <td className={`${tableStyles.td} text-right`}>
                        {g.gateway === "sin_definir" ? <span className="text-brand-gray">—</span> : <FeeInput gateway={g.gateway} value={g.feePct} onSaved={load} />}
                      </td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{g.estimatedFee == null ? "—" : clp(g.mrr - g.estimatedFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.subscriptionGateways.some((g) => g.gateway === "sin_definir") && (
              <p className="mt-3 text-xs text-brand-gray">"Sin definir": esas suscripciones aún no tienen registrada la pasarela con la que pagan.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-gray">Cobros de los negocios con terminal (este mes)</p>
            <div className="overflow-x-auto">
              <table className={tableStyles.table}>
                <thead className={tableStyles.thead}>
                  <tr>
                    <th className={tableStyles.th}>Pasarela</th>
                    <th className={`${tableStyles.th} text-right`}>Cobros</th>
                    <th className={`${tableStyles.th} text-right`}>Volumen</th>
                    <th className={`${tableStyles.th} text-right`}>Comisión</th>
                    <th className={`${tableStyles.th} text-right`}>Comisión $</th>
                  </tr>
                </thead>
                <tbody>
                  {data.volumeGateways.map((g) => (
                    <tr key={g.gateway} className={tableStyles.tr}>
                      <td className={`${tableStyles.td} font-medium`}>{g.label}</td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{g.count}</td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{clp(g.volume)}</td>
                      <td className={`${tableStyles.td} text-right`}><FeeInput gateway={g.gateway} value={g.feePct} onSaved={load} /></td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{g.estimatedFee == null ? "—" : clp(g.estimatedFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-brand-gray">Todas las ventas por medio de pago</p>
            <Bars
              tone="bg-violet-500"
              rows={data.byMethod.map((m) => ({ label: METHOD_LABELS[m.method] || m.method, value: m.total, right: `${clp(m.total)} · ${pct(m.total, totalMethod)}%` }))}
            />
          </div>
        </div>
      </Panel>

      {/* Empresas: destacadas y en riesgo */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Empresas que más venden" subtitle="Este mes" action={<Trophy className="h-4 w-4 text-amber-500" strokeWidth={1.75} />}>
          <ul className="divide-y divide-black/5 px-5 pb-4 dark:divide-white/5">
            {data.topTenants.length === 0 && <li className="py-6 text-center text-sm text-brand-gray">Sin ventas este mes</li>}
            {data.topTenants.map((x, i) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-sm font-bold text-brand-gray">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-dark">{x.name}</p>
                  <p className="text-xs text-brand-gray">{x.city} · {x.count} ventas</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-brand-dark">{clp(x.total)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Pruebas por vencer" subtitle="Para contactar antes de que termine" action={<Hourglass className="h-4 w-4 text-amber-500" strokeWidth={1.75} />}>
          <ul className="divide-y divide-black/5 px-5 pb-4 dark:divide-white/5">
            {data.trialsEnding.length === 0 && <li className="py-6 text-center text-sm text-brand-gray">No hay empresas en prueba</li>}
            {data.trialsEnding.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-dark">{x.name}</p>
                  <p className="text-xs capitalize text-brand-gray">{x.city} · {x.plan}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${x.daysLeft <= 3 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"}`}>
                  {x.daysLeft < 0 ? `Venció hace ${-x.daysLeft} d` : x.daysLeft === 0 ? "Vence hoy" : `${x.daysLeft} d`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Activas sin ventas este mes" subtitle="Posible riesgo de abandono" action={<AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.75} />}>
          <ul className="divide-y divide-black/5 px-5 pb-4 dark:divide-white/5">
            {data.idleTenants.length === 0 && <li className="py-6 text-center text-sm text-brand-gray">Todas las activas han vendido</li>}
            {data.idleTenants.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-dark">{x.name}</p>
                  <p className="text-xs capitalize text-brand-gray">{x.city} · {x.plan}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Rubros */}
      <Panel title="Empresas por rubro" action={<Store className="h-4 w-4 text-brand-gray" strokeWidth={1.75} />}>
        <div className="px-5 pb-5">
          <Bars
            tone="bg-slate-400"
            rows={data.byCategory.map((c) => ({ label: catLabel(c.category === "sin_clasificar" ? "" : c.category), value: c.count, right: `${c.count} · ${pct(c.count, t.total)}%` }))}
          />
        </div>
      </Panel>
    </div>
  );
}
