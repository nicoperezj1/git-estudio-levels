"use client";

import { useState, useEffect } from "react";
import { formatCurrency, todayInChile } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronLeft, ChevronRight, FileDown, Coins, Percent, KeyRound, TrendingDown, PiggyBank, Receipt, CalendarCheck, UserPlus,
} from "lucide-react";
import { PageHeader, StatCard, Panel, tableStyles as ts, primaryButton } from "@/components/ui/premium";
import { useAuth } from "@/lib/auth-context";
import { MonthClosePanel } from "@/components/finance/month-close-panel";

interface ReportData {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    incomeCommission: number;
    incomeRental: number;
    salonNetIncome: number;
    totalTransactions: number;
    appointmentsCompleted: number;
    newClients: number;
  };
  incomeByBarber: Array<{ name: string; total: number; count: number; workMode: string }>;
  incomeByMethod: Array<{ method: string; total: number; count: number }>;
  topServices: Array<{ name: string; count: number; total: number }>;
  topProducts: Array<{ name: string; count: number; total: number }>;
  expensesDetail: Array<{ name: string; count: number; total: number }>;
}

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Debito",
  credit_card: "Credito",
  transfer: "Transferencia",
};

export default function ReportesPage() {
  const { isAtLeast } = useAuth();
  const [chileYear, chileMonth] = todayInChile().split("-").map(Number);
  const [month, setMonth] = useState(chileMonth);
  const [year, setYear] = useState(chileYear);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<Array<{ label: string; income: number; expenses: number }>>([]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reportes/monthly?month=${month}&year=${year}`);
      const result = await res.json();
      if (result.summary) {
        setData(result);
      }
    } catch (err) {
      console.error("Error fetching report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, [month, year]);

  useEffect(() => {
    fetch("/api/reportes/comparison")
      .then((r) => r.json())
      .then((d) => setComparison(Array.isArray(d) ? d : []));
  }, []);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <PageHeader title="Cierre mensual" />
        <Spinner />
      </div>
    );
  }

  const chartMax = Math.max(...comparison.map((c) => Math.max(c.income, c.expenses)), 1);

  return (
    <div className="mx-auto max-w-7xl space-y-3 md:space-y-6 p-3 md:p-8 animate-fade-in">
      <PageHeader
        title="Cierre mensual"
        subtitle="Resultado del mes: ingresos, egresos y utilidad del salón."
        actions={
          <>
            {/* Navegacion de mes */}
            <div className="flex items-center gap-1 rounded-2xl border border-gray-100 bg-brand-light p-1">
              <button
                onClick={() => changeMonth(-1)}
                aria-label="Mes anterior"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-gray transition-colors hover:bg-white hover:text-brand-blue dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <span className="min-w-[150px] text-center text-sm font-bold text-brand-dark">
                {monthNames[month - 1]} {year}
              </span>
              <button
                onClick={() => changeMonth(1)}
                aria-label="Mes siguiente"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-gray transition-colors hover:bg-white hover:text-brand-blue dark:hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <a href={`/api/reportes/pdf?month=${month}&year=${year}`} className={primaryButton}>
              <FileDown className="h-4 w-4" strokeWidth={2} /> Descargar PDF
            </a>
          </>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          hero
          className="col-span-2 lg:col-span-2"
          label="Movimiento total (bruto)"
          value={formatCurrency(data.summary.totalIncome)}
          Icon={Coins}
          hint="Incluye ventas de arrendatarios"
        />
        <StatCard
          label="Ingresos comisión"
          value={formatCurrency(data.summary.incomeCommission)}
          Icon={Percent}
          tone="violet"
          hint="Ingresa al salón"
        />
        <StatCard
          label="Ingresos arriendo"
          value={formatCurrency(data.summary.incomeRental)}
          Icon={KeyRound}
          tone="amber"
          hint="No ingresa al salón"
        />
        <StatCard
          label="Egresos"
          value={formatCurrency(data.summary.totalExpenses)}
          Icon={TrendingDown}
          tone="red"
        />
        <StatCard
          label="Utilidad salón"
          value={formatCurrency(data.summary.salonNetIncome)}
          Icon={PiggyBank}
          tone="green"
          hint="Comisión − egresos"
        />
        <StatCard label="Transacciones" value={data.summary.totalTransactions} Icon={Receipt} tone="slate" />
        <StatCard label="Citas completadas" value={data.summary.appointmentsCompleted} Icon={CalendarCheck} tone="teal" />
        <StatCard label="Clientes nuevos" value={data.summary.newClients} Icon={UserPlus} tone="green" />
      </div>

      {/* Monthly Comparison Chart */}
      {comparison.length > 0 && (
        <Panel
          title="Comparativa mensual"
          subtitle="Últimos 6 meses"
          action={
            <div className="flex items-center gap-4 text-xs text-brand-gray">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-brand-blue to-emerald-400" /> Ingresos</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /> Egresos</span>
            </div>
          }
        >
          <div className="flex h-52 items-end justify-between gap-3">
            {comparison.map((m) => {
              const incomeHeight = (m.income / chartMax) * 100;
              const expenseHeight = (m.expenses / chartMax) * 100;
              return (
                <div key={m.label} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div
                      className="w-4 rounded-full bg-gradient-to-t from-brand-blue to-emerald-400 opacity-80 transition-all duration-300 group-hover:opacity-100 md:w-6"
                      style={{ height: `${Math.max(incomeHeight, 2)}%` }}
                      title={`Ingresos: ${formatCurrency(m.income)}`}
                    />
                    <div
                      className="w-4 rounded-full bg-red-400/60 transition-all duration-300 group-hover:bg-red-400 md:w-6"
                      style={{ height: `${Math.max(expenseHeight, 2)}%` }}
                      title={`Egresos: ${formatCurrency(m.expenses)}`}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-brand-gray">{m.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Tables Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Income by Barber */}
        <Panel flush title="Ingresos por profesional">
          <div className={ts.wrap}>
            <table className={ts.table}>
              <thead className={ts.thead}>
                <tr>
                  <th className={ts.th}>Profesional</th>
                  <th className={ts.thCenter}>Modo</th>
                  <th className={ts.thRight}>Total</th>
                </tr>
              </thead>
              <tbody className={ts.tbody}>
                {data.incomeByBarber?.map((row, i) => (
                  <tr key={i} className={ts.tr}>
                    <td className={ts.td}>{row.name}</td>
                    <td className={ts.tdCenter}>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          row.workMode === "rental" ? "bg-amber-500/10 text-amber-500" : "bg-violet-500/10 text-violet-500"
                        }`}
                      >
                        {row.workMode === "rental" ? "Arriendo" : "Comisión"}
                      </span>
                    </td>
                    <td className={ts.tdRight}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* By Payment Method */}
        <Panel flush title="Por método de pago">
          <div className={ts.wrap}>
            <table className={ts.table}>
              <thead className={ts.thead}>
                <tr>
                  <th className={ts.th}>Método</th>
                  <th className={ts.thRight}>Total</th>
                </tr>
              </thead>
              <tbody className={ts.tbody}>
                {data.incomeByMethod?.map((row, i) => (
                  <tr key={i} className={ts.tr}>
                    <td className={ts.td}>{paymentMethodLabels[row.method] || row.method}</td>
                    <td className={ts.tdRight}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Top Services */}
        <Panel flush title="Top servicios">
          <div className={ts.wrap}>
            <table className={ts.table}>
              <thead className={ts.thead}>
                <tr>
                  <th className={ts.th}>Servicio</th>
                  <th className={ts.thCenter}>Cantidad</th>
                  <th className={ts.thRight}>Total</th>
                </tr>
              </thead>
              <tbody className={ts.tbody}>
                {data.topServices?.map((row, i) => (
                  <tr key={i} className={ts.tr}>
                    <td className={ts.td}>{row.name}</td>
                    <td className={ts.tdCenter}>{row.count}</td>
                    <td className={ts.tdRight}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Top Products */}
        <Panel flush title="Top productos">
          <div className={ts.wrap}>
            <table className={ts.table}>
              <thead className={ts.thead}>
                <tr>
                  <th className={ts.th}>Producto</th>
                  <th className={ts.thCenter}>Cantidad</th>
                  <th className={ts.thRight}>Total</th>
                </tr>
              </thead>
              <tbody className={ts.tbody}>
                {data.topProducts?.map((row, i) => (
                  <tr key={i} className={ts.tr}>
                    <td className={ts.td}>{row.name}</td>
                    <td className={ts.tdCenter}>{row.count}</td>
                    <td className={ts.tdRight}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Detalle de egresos: lista simple (concepto y monto), sin columnas de relleno. */}
        <Panel title="Detalle de egresos">
          {(!data.expensesDetail || data.expensesDetail.length === 0) ? (
            <p className="py-8 text-center text-sm text-brand-gray">Sin egresos en este periodo</p>
          ) : (
            <div>
              <ul className="divide-y divide-gray-100">
                {data.expensesDetail.map((row, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                    {/* El sufijo " (gasto fijo)" es de registros guardados antes del cambio de nombre. */}
                    <span className="min-w-0 truncate text-sm text-brand-dark">{row.name.replace(" (gasto fijo)", "")}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-red-500">{formatCurrency(row.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-gray-200 pt-3">
                <span className="text-sm font-bold text-brand-dark">Total egresos</span>
                <span className="text-base font-bold tabular-nums text-red-500">{formatCurrency(data.summary.totalExpenses)}</span>
              </div>
            </div>
          )}
        </Panel>

        {/* Gastos del mes y cerrar / reabrir (solo administrador), al lado de los egresos. */}
        {isAtLeast("admin") && <MonthClosePanel month={month} year={year} onChanged={fetchReport} />}
      </div>
    </div>
  );
}
