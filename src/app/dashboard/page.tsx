"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, todayInChile, dateStrOffset } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, EmptyIcons } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { SalesChart, type ChartRange, type ChartPoint } from "@/components/dashboard/sales-chart";
import { ProductCarousel, type CarouselItem } from "@/components/dashboard/product-carousel";
import { Eye, EyeOff, SlidersHorizontal, PackageX, ShoppingBag, CalendarCheck, Wallet, UserPlus, RefreshCw, CalendarX, CalendarDays } from "lucide-react";
import { PageHeader, StatCard, Panel, Segmented } from "@/components/ui/premium";
import { BusinessQuoteNote } from "@/components/dashboard/business-quote-note";
import { SuperAdminDashboard } from "@/components/dashboard/superadmin-dashboard";
import { BirthdaysCard } from "@/components/dashboard/birthdays-card";
import { SupplyRequestsCard } from "@/components/dashboard/supply-requests-card";
import { ProblemReportsCard } from "@/components/dashboard/problem-reports-card";
import { BookingRuleCard } from "@/components/dashboard/booking-rule-card";
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

const HIDDEN_KEY = "dashboard_hidden_sections";
const AMOUNT_KEY = "dashboard_hide_amount";

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* sin almacenamiento: solo dura la sesion */ }
}

// Envoltorio para ocultar cajas del Dashboard (solo en este navegador; no borra nada).
function Sec({ id, hidden, editing, onToggle, className = "", children }: {
  id: string; hidden: Set<string>; editing: boolean; onToggle: (id: string) => void; className?: string; children: ReactNode;
}) {
  const isHidden = hidden.has(id);
  if (isHidden && !editing) return null;
  if (!editing) return <div className={`${className} [&>*]:h-full`}>{children}</div>;
  return (
    <div className={`relative ${className} ${isHidden ? "opacity-40" : ""}`}>
      <div className="[&>*]:h-full">{children}</div>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-gray-900/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg hover:bg-gray-900"
      >
        {isHidden ? <><Eye className="h-3 w-3" /> Mostrar</> : <><EyeOff className="h-3 w-3" /> Ocultar</>}
      </button>
    </div>
  );
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
  // Personalizar: cajas ocultas + ojito del monto. Se guardan solo en este navegador.
  const [hiddenSecs, setHiddenSecs] = useState<Set<string>>(new Set());
  const [hideAmount, setHideAmount] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  useEffect(() => {
    try { setHiddenSecs(new Set(JSON.parse(readLS(HIDDEN_KEY) || "[]"))); } catch { /* ignorar */ }
    setHideAmount(readLS(AMOUNT_KEY) === "1");
  }, []);
  const toggleSec = (id: string) => setHiddenSecs((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeLS(HIDDEN_KEY, JSON.stringify(Array.from(next)));
    return next;
  });
  const secProps = { hidden: hiddenSecs, editing: editingLayout, onToggle: toggleSec };
  const resetSecs = () => { setHiddenSecs(new Set()); writeLS(HIDDEN_KEY, "[]"); setHideAmount(false); writeLS(AMOUNT_KEY, "0"); };
  const toggleAmount = () => setHideAmount((v) => { writeLS(AMOUNT_KEY, v ? "0" : "1"); return !v; });
  const { user, effectiveRole, isAtLeast } = useAuth();
  const { tenant, loading: tenantLoading, isOverriding } = useTenant();
  // Super Admin (sin "Entrar" a una empresa): ve el panel de plataforma, no el de un negocio.
  const isSuperView = effectiveRole === "super_admin" && !isOverriding;
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
    if (isSuperView) { setLoading(false); return; }

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
  }, [tenant?.id, tenantLoading, selectedDate, isToday, chartRange, isSuperView]);

  if (isSuperView) return <SuperAdminDashboard />;

  if (loading) return <Spinner />;

  // Si el perfil no tiene nombre guardado, el nombre es el correo: se usa solo lo anterior a la @.
  const firstName = (user?.name?.includes("@") ? user.name.split("@")[0] : user?.name?.split(" ")[0]) || "Usuario";
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
      <div className="p-3 md:p-6 animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-dark tracking-tight">Hola, {firstName}</h1>
          <p className="text-brand-gray text-sm mt-1">Tu dashboard esta vacio. Agrega servicios y clientes para empezar.</p>
        </div>
      </div>
    );
  }

  // Carrusel de stock bajo. Estados: "Descuadrado" (stock negativo: se vendio mas de lo que
  // estaba cargado en el inventario, falta registrar el ingreso), "Sin stock" (0) y "Bajo"
  // (en o bajo el minimo pero queda). Se muestra "N uds · mín. M" en vez de "N/M" para que
  // no parezca una fraccion.
  const lowStockItems: CarouselItem[] = (data.lowStock || []).map((p) => {
    const state = p.stock < 0 ? "Descuadrado" : p.stock === 0 ? "Sin stock" : "Bajo";
    return {
      id: p.id,
      primary: p.name,
      secondary: `${p.stock} uds · mín. ${p.minStock} · ${state}`,
      tone: p.stock <= 0 ? "danger" : "warning",
    } as CarouselItem;
  });

  const topProductItems: CarouselItem[] = (data.topProducts || []).map((p, i) => ({
    id: p.name,
    primary: p.name,
    secondary: `${p.count} vendidos`,
    tone: i === 0 ? "success" : "neutral",
  }));

  const yesterday = dateStrOffset(todayInChile(), -1);
  const dayValue: "today" | "yesterday" | "" = isToday ? "today" : selectedDate === yesterday ? "yesterday" : "";
  const maxServiceCount = Math.max(...data.topServices.map((sv) => sv.count), 1);
  const statusBadge: Record<string, { label: string; cls: string }> = {
    completed: { label: "Completada", cls: "bg-emerald-500/10 text-emerald-500" },
    cancelled: { label: "Cancelada", cls: "bg-red-500/10 text-red-500" },
    no_show: { label: "No asistió", cls: "bg-amber-500/10 text-amber-500" },
  };

  return (
    <div className="mx-auto max-w-7xl space-y-3 md:space-y-6 p-3 md:p-8">
      {/* Header */}
      <PageHeader
        title={`Hola, ${firstName}`}
        subtitle={isToday ? "Aquí tienes el resumen de tu negocio hoy." : `Resumen de tu negocio del ${selectedDateLabel}.`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditingLayout((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-sm font-medium transition md:py-2 ${editingLayout ? "border-brand-blue bg-brand-blue text-white" : "border-gray-100 bg-white text-brand-gray hover:text-brand-dark"}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {editingLayout ? "Listo" : "Personalizar"}
            </button>
            {editingLayout && (
              <button type="button" onClick={resetSecs} className="rounded-2xl border border-gray-100 bg-white px-3 py-1.5 text-sm font-medium text-brand-gray hover:text-brand-dark md:py-2">
                Restaurar todo
              </button>
            )}
            {/* Punto 8: selector de fecha, para consultar el Dashboard de un dia anterior */}
            <Segmented
              value={dayValue}
              onChange={(v) => setSelectedDate(v === "today" ? todayInChile() : yesterday)}
              options={[
                { value: "today", label: "Hoy" },
                { value: "yesterday", label: "Ayer" },
              ]}
            />
            <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-1.5 text-sm text-brand-gray md:px-3.5 md:py-2 transition focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10">
              <CalendarDays className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              <input
                type="date"
                value={selectedDate}
                max={todayInChile()}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-brand-dark outline-none"
              />
            </div>
          </>
        }
      />

      {/* Stat Cards: Ventas destacada + 4 metricas */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
        <Sec id="ventas" className="col-span-2" {...secProps}>
        <StatCard
          hero
          labelAction={
            <button type="button" onClick={toggleAmount} title={hideAmount ? "Mostrar monto" : "Ocultar monto"} className="rounded-full p-1 text-white/80 hover:bg-white/20 hover:text-white">
              {hideAmount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          label={isToday ? "Ventas hoy" : "Ventas"}
          value={hideAmount ? "$ ••••••" : formatCurrency(data.stats.ventasHoy)}
          Icon={Wallet}
          delta={{ value: data.stats.ventasChange, suffix: "vs dia anterior" }}
        />
        </Sec>
        <Sec id="reservas" {...secProps}>
        <StatCard
          label={isToday ? "Reservas hoy" : "Reservas"}
          value={data.stats.reservasHoy}
          Icon={CalendarCheck}
          tone="teal"
          delta={{ value: data.stats.reservasChange }}
        />
        </Sec>
        <Sec id="clientes" {...secProps}>
        <StatCard
          label="Clientes nuevos"
          value={data.stats.clientesNuevos}
          Icon={UserPlus}
          tone="green"
          delta={{ value: data.stats.clientesChange }}
        />
        </Sec>
        <Sec id="reagend" {...secProps}>
        <StatCard
          label="Reagendamientos"
          value={data.stats.reagendamientos}
          Icon={RefreshCw}
          tone="violet"
          delta={{ value: data.stats.reagendamientosChange }}
        />
        </Sec>
        <Sec id="cancel" {...secProps}>
        <StatCard
          label="Cancelaciones"
          value={data.stats.cancelaciones}
          Icon={CalendarX}
          tone="red"
          delta={{ value: data.stats.cancelacionesChange, invert: true }}
        />
        </Sec>
      </div>

      {/* Cumpleanos del mes (solo admin; no se muestra si no hay) */}
      {isAtLeast("admin") && <Sec id="problemas" className="empty:hidden" {...secProps}><ProblemReportsCard /></Sec>}
      {isAtLeast("admin") && <Sec id="reglaReservas" className="empty:hidden" {...secProps}><BookingRuleCard /></Sec>}
      {isAtLeast("admin") && <Sec id="insumos" className="empty:hidden" {...secProps}><SupplyRequestsCard tenantId={tenant?.id} /></Sec>}
      {isAtLeast("admin") && <Sec id="cumples" className="empty:hidden" {...secProps}><BirthdaysCard tenantId={tenant?.id} /></Sec>}

      <Sec id="grafico" {...secProps}>
      <SalesChart
        data={data.chartData || []}
        range={chartRange}
        onRangeChange={setChartRange}
        total={data.chartTotal || 0}
        growth={data.chartGrowth || 0}
        loading={chartLoading}
      />
      </Sec>

      {/* Aviso de stock bajo + Productos mas vendidos — carruseles de 3 por vista */}
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
        <Sec id="stockBajo" {...secProps}>
        <ProductCarousel
          title="Stock bajo"
          icon={<PackageX className="h-4 w-4" />}
          emptyMessage="Todo el inventario esta dentro de su stock minimo."
          items={lowStockItems}
        />
        </Sec>
        <Sec id="masVendidos" {...secProps}>
        <ProductCarousel
          title="Mas vendidos (ultimos 30 dias)"
          icon={<ShoppingBag className="h-4 w-4" />}
          emptyMessage="Sin ventas de productos en este periodo."
          items={topProductItems}
        />
        </Sec>
      </div>

      {/* Main content: Agenda + Top Services */}
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-5">
        {/* Agenda del dia elegido (por defecto, hoy) */}
        <Sec id="agenda" className="lg:col-span-3" {...secProps}>
        <Panel
          className="lg:col-span-3"
          title={isToday ? "Agenda de hoy" : "Agenda de ese dia"}
          subtitle={data.todayAppointments.length > 0 ? `${data.todayAppointments.length} cita${data.todayAppointments.length > 1 ? "s" : ""}` : undefined}
          action={
            <Link href="/dashboard/calendario" className="text-xs font-semibold text-brand-blue hover:underline">
              Ver agenda completa →
            </Link>
          }
        >
          {data.todayAppointments.length === 0 ? (
            <EmptyState
              icon={EmptyIcons.agendaEmpty}
              title={isToday ? "No hay citas agendadas para hoy" : "No hay citas agendadas para ese dia"}
              description="Cuando se agende una cita aparecera aqui."
            />
          ) : (
            <div className="relative space-y-2">
              {data.todayAppointments.map((appt) => {
                const time = appt.start_time?.match(/(\d{2}:\d{2})/)?.[1] || "";
                const serviceName = appt.services?.map((sv: any) => sv.service?.name).join(" + ") || "Servicio";
                const badge = statusBadge[appt.status];
                return (
                  <div
                    key={appt.id}
                    className="group flex items-center gap-3 rounded-2xl border border-transparent p-2 transition-colors md:gap-4 md:p-3 hover:border-brand-blue/20 hover:bg-brand-blue/[0.04]"
                  >
                    <span className="w-[58px] flex-shrink-0 rounded-xl bg-brand-blue/10 py-1.5 text-center text-sm font-bold text-brand-blue tabular-nums">
                      {time}
                    </span>
                    <div className="h-9 w-1 flex-shrink-0 rounded-full bg-gradient-to-b from-brand-blue to-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-brand-dark">{serviceName}</p>
                      <p className="truncate text-xs text-brand-gray">
                        {appt.client?.name || "Cliente"} · {appt.barber?.name}
                      </p>
                    </div>
                    {badge && (
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        </Sec>

        {/* Top Servicios */}
        <Sec id="topServicios" className="lg:col-span-2" {...secProps}>
        <Panel
          className="lg:col-span-2"
          title="Top servicios"
          action={
            <Link href="/dashboard/reportes" className="text-xs font-semibold text-brand-blue hover:underline">
              Ver cierre →
            </Link>
          }
        >
          {data.topServices.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-gray">Sin datos aun</p>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {data.topServices.map((svc, i) => (
                <div key={svc.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          i === 0 ? "bg-brand-blue text-white shadow-md shadow-brand-blue/30" : "bg-brand-blue/10 text-brand-blue"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium text-brand-dark">{svc.name}</span>
                    </div>
                    <span className="text-sm font-bold text-brand-dark tabular-nums">{svc.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-blue to-emerald-500 transition-all duration-700"
                      style={{ width: `${Math.max((svc.count / maxServiceCount) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        </Sec>
      </div>
      {/* Frase de negocios (solo admin): franja discreta al final */}
      {isAtLeast("admin") && <Sec id="frase" {...secProps}><BusinessQuoteNote /></Sec>}
    </div>
  );
}
