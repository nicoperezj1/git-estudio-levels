"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, todayInChile, dateStrOffset } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, EmptyIcons } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { SalesChart, type ChartRange, type ChartPoint } from "@/components/dashboard/sales-chart";
import { ProductCarousel, type CarouselItem } from "@/components/dashboard/product-carousel";
import { PackageX, ShoppingBag } from "lucide-react";
import Link from "next/link";

interface DashboardData {
  date?: string;
  stats: {
    reservasHoy: number;
    reservasChange: number;
    ventasHoy: number;
    ventasChange: number;
    clientesNuevos: number;
    clientesChange: number;
    reagendamientos: number;
    reagendamientosChange: number;
    cancelaciones: number;
    cancelacionesChange: number;
  };
  todayAppointments: Array<{
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    client: { name: string } | null;
    barber: { name: string } | null;
    services: Array<{ service: { name: string } }>;
  }>;
  topServices: Array<{ name: string; count: number }>;
  topProducts: Array<{ name: string; count: number }>;
  lowStock: Array<{ id: string; name: string; stock: number; minStock: number }>;
  chartRange: ChartRange;
  chartData: ChartPoint[];
  chartTotal: number;
  chartGrowth: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // Punto 8 (Pablo): antes solo se podia ver el dia actual. Por defecto sigue siendo
  // hoy (comportamiento previo), pero ahora se puede elegir cualquier dia anterior para
  // revisar ventas, reservas y servicios de esa fecha.
  const [selectedDate, setSelectedDate] = useState(todayInChile());
  // Punto 9 (Pablo): rango del grafico de ventas — 7 dias / 1 mes / 3 meses / 12 meses,
  // para ir viendo el crecimiento del negocio de forma comoda.
  const [chartRange, setChartRange] = useState<ChartRange>("7d");
  const [chartLoading, setChartLoading] = useState(false);
  const { user, effectiveRole } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const isToday = selectedDate === todayInChile();
  const router = useRouter();

  // Item 37 (Nico, 27-sep): un negocio nuevo (admin) que aun no completo el wizard de
  // bienvenida es mandado ahi apenas cae en el dashboard, en vez de ver metricas vacias.
  // Solo aplica al admin del negocio -- un barbero/recepcionista que se loguea despues no
  // tiene por que ver el wizard de puesta en marcha, eso lo hace el dueño una sola vez.
  // Un super_admin sin tenant (tenant === null) tampoco cae aca.
  useEffect(() => {
    if (tenantLoading || !tenant) return;
    if (effectiveRole === "admin" && !tenant.onboarding_completed) {
      router.replace("/dashboard/onboarding");
    }
  }, [tenantLoading, tenant, effectiveRole, router]);

  useEffect(() => {
    if (tenantLoading) return;

    const fetchDashboard = (opts?: { silent?: boolean }) => {
      const params = new URLSearchParams({ date: selectedDate, range: chartRange });
      if (tenant?.id) params.set("tenantId", tenant.id);
      if (!opts?.silent) setChartLoading(true);
      fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setData(d))
        .finally(() => {
          setLoading(false);
          setChartLoading(false);
        });
    };

    fetchDashboard();

    // Auto-refresh every 30 seconds — only useful while looking at today; a past day's
    // numbers don't change, so polling them would just be wasted requests.
    if (!isToday) return;
    const interval = setInterval(() => fetchDashboard({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [tenant?.id, tenantLoading, selectedDate, isToday, chartRange]);

  if (loading) return <Spinner />;

  const firstName = user?.name?.split(" ")[0] || "Usuario";
  // El titulo de fecha debe reflejar el dia elegido, no siempre "hoy" del navegador.
  const selectedDateLabel = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(`${selectedDate}T12:00:00Z`));

  // If no data (no tenant or empty), show empty dashboard
  if (!data) {
    return (
      <div className="p-4 md:p-6 animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-dark tracking-tight">Hola, {firstName}</h1>
          <p className="text-brand-gray text-sm mt-1">Tu dashboard esta vacio. Agrega servicios y clientes para empezar.</p>
        </div>
      </div>
    );
  }

  // `invert`: para metricas donde subir es MALO (ej. Cancelaciones) — un + rojo, un -
  // verde. Antes todo positivo se pintaba verde, incluso mas cancelaciones, que es peor
  // para el negocio, no mejor.
  const StatChange = ({ value, invert = false }: { value: number; invert?: boolean }) => {
    const isGood = invert ? value <= 0 : value >= 0;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full mt-2 ${
          isGood ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10" : "text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
        }`}
      >
        {value >= 0 ? "+" : ""}
        {value}%
        <span className="font-normal opacity-70">vs dia anterior</span>
      </span>
    );
  };

  // Carrusel de stock bajo: "critico" cuando ya llego a 0, "bajo" cuando esta en o por
  // debajo del minimo pero todavia queda algo.
  const lowStockItems: CarouselItem[] = (data.lowStock || []).map((p) => ({
    id: p.id,
    primary: p.name,
    secondary: `${p.stock}/${p.minStock} uds · ${p.stock <= 0 ? "Critico" : "Bajo"}`,
    tone: p.stock <= 0 ? "danger" : "warning",
  }));

  const topProductItems: CarouselItem[] = (data.topProducts || []).map((p, i) => ({
    id: p.name,
    primary: p.name,
    secondary: `${p.count} vendidos`,
    tone: i === 0 ? "success" : "neutral",
  }));

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-brand-dark tracking-tight">
              Hola, {firstName}
            </h1>
            <p className="text-brand-gray text-sm mt-0.5">
              {isToday
                ? "Aqui tienes el resumen de tu negocio hoy."
                : `Resumen de tu negocio del ${selectedDateLabel}.`}
            </p>
          </div>
        </div>
        {/* Punto 8: selector de fecha, para consultar el Dashboard de un dia anterior */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate(todayInChile())}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${isToday ? "bg-brand-blue text-white" : "bg-white dark:bg-brand-white border border-gray-100 dark:border-white/10 text-brand-gray hover:bg-gray-50 dark:hover:bg-white/5"}`}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(dateStrOffset(todayInChile(), -1))}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedDate === dateStrOffset(todayInChile(), -1) ? "bg-brand-blue text-white" : "bg-white dark:bg-brand-white border border-gray-100 dark:border-white/10 text-brand-gray hover:bg-gray-50 dark:hover:bg-white/5"}`}
          >
            Ayer
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-brand-white rounded-xl border border-gray-100 dark:border-white/10 text-sm text-brand-gray">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <input
              type="date"
              value={selectedDate}
              max={todayInChile()}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="text-sm text-brand-gray bg-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5 transition-all duration-300 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5">
          <p className="text-xs text-brand-gray font-medium">{isToday ? "Reservas hoy" : "Reservas"}</p>
          <p className="text-3xl font-bold text-brand-dark mt-1">{data.stats.reservasHoy}</p>
          <StatChange value={data.stats.reservasChange} />
        </div>
        <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5 transition-all duration-300 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5">
          <p className="text-xs text-brand-gray font-medium">{isToday ? "Ventas hoy" : "Ventas"}</p>
          <p className="text-3xl font-bold text-brand-dark mt-1">{formatCurrency(data.stats.ventasHoy)}</p>
          <StatChange value={data.stats.ventasChange} />
        </div>
        <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5 transition-all duration-300 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5">
          <p className="text-xs text-brand-gray font-medium">Clientes nuevos</p>
          <p className="text-3xl font-bold text-brand-dark mt-1">{data.stats.clientesNuevos}</p>
          <StatChange value={data.stats.clientesChange} />
        </div>
        <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5 transition-all duration-300 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5">
          <p className="text-xs text-brand-gray font-medium">Reagendamientos</p>
          <p className="text-3xl font-bold text-brand-dark mt-1">{data.stats.reagendamientos}</p>
          <StatChange value={data.stats.reagendamientosChange} />
        </div>
        <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5 transition-all duration-300 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5">
          <p className="text-xs text-brand-gray font-medium">Cancelaciones</p>
          <p className="text-3xl font-bold text-brand-dark mt-1">{data.stats.cancelaciones}</p>
          <StatChange value={data.stats.cancelacionesChange} invert />
        </div>
      </div>

      {/* Sales Chart — Punto 9: 7 dias / 1 mes / 3 meses / 12 meses */}
      <SalesChart
        data={data.chartData || []}
        range={chartRange}
        onRangeChange={setChartRange}
        total={data.chartTotal || 0}
        growth={data.chartGrowth || 0}
        loading={chartLoading}
      />

      {/* Aviso de stock bajo + Productos mas vendidos — carruseles de 3 por vista */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductCarousel
          title="Stock bajo"
          icon={<PackageX className="w-4 h-4" />}
          emptyMessage="Todo el inventario esta dentro de su stock minimo."
          items={lowStockItems}
        />
        <ProductCarousel
          title="Mas vendidos (ultimos 30 dias)"
          icon={<ShoppingBag className="w-4 h-4" />}
          emptyMessage="Sin ventas de productos en este periodo."
          items={topProductItems}
        />
      </div>

      {/* Main content: Agenda + Top Services */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Agenda del dia elegido (por defecto, hoy) */}
        <div className="lg:col-span-3 bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-brand-dark">{isToday ? "Agenda de hoy" : "Agenda de ese dia"}</h3>
            <Link href="/dashboard/calendario" className="text-xs text-brand-blue font-medium hover:underline">
              Ver agenda completa →
            </Link>
          </div>

          {data.todayAppointments.length === 0 ? (
            <EmptyState
              icon={EmptyIcons.agendaEmpty}
              title={isToday ? "No hay citas agendadas para hoy" : "No hay citas agendadas para ese dia"}
              description="Cuando se agende una cita aparecera aqui."
            />
          ) : (
            <div className="space-y-1">
              {data.todayAppointments.map((appt) => {
                const time = appt.start_time?.match(/(\d{2}:\d{2})/)?.[1] || "";
                const serviceName = appt.services?.map((s: any) => s.service?.name).join(" + ") || "Servicio";
                return (
                  <div key={appt.id} className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-brand-gray font-medium w-12">{time}</span>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="w-1 h-10 rounded-full bg-brand-blue/60" />
                      <div>
                        <p className="text-sm font-semibold text-brand-dark">{serviceName}</p>
                        <p className="text-xs text-brand-gray">{appt.client?.name || "Cliente"} · {appt.barber?.name}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Servicios */}
        <div className="lg:col-span-2 bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-brand-dark">Top Servicios</h3>
            <Link href="/dashboard/reportes" className="text-xs text-brand-blue font-medium hover:underline">
              Ver reporte completo →
            </Link>
          </div>

          {data.topServices.length === 0 ? (
            <p className="text-center py-8 text-brand-gray text-sm">Sin datos aun</p>
          ) : (
            <div className="space-y-4">
              {data.topServices.map((svc, i) => (
                <div key={svc.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-brand-gray font-medium w-4">{i + 1}</span>
                    <span className="text-sm text-brand-dark font-medium">{svc.name}</span>
                  </div>
                  <span className="text-sm font-bold text-brand-dark">{svc.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
