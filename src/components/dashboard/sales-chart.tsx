"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export type ChartRange = "7d" | "1m" | "3m" | "12m";

export interface ChartPoint {
  label: string;
  date: string;
  total: number;
}

interface SalesChartProps {
  data: ChartPoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  total: number;
  growth: number;
  loading?: boolean;
}

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "1m", label: "1 mes" },
  { value: "3m", label: "3 meses" },
  { value: "12m", label: "12 meses" },
];

// Punto 9 (Pablo): grafico de ventas rediseñado con la estetica de tarjeta elegante
// (bordes suaves, blur, barras interactivas con tooltip) que Pablo envio como
// referencia, adaptado a los datos reales del negocio y con selector de rango
// (7 dias / 1 mes / 3 meses / 12 meses) para ir viendo el crecimiento.
export function SalesChart({ data, range, onRangeChange, total, growth, loading }: SalesChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  // Total y variacion vs el periodo anterior quedan plegados tras la flecha junto a "Ventas".
  const [showSummary, setShowSummary] = useState(false);

  const maxValue = Math.max(...data.map((d) => d.total), 1);
  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const isPositive = growth >= 0;

  // Con 30 barras diarias (1 mes) mostrar una etiqueta por barra satura el eje —
  // se muestra 1 de cada N para que siga siendo legible.
  const labelStride = data.length > 14 ? Math.ceil(data.length / 8) : 1;

  const handleContainerLeave = () => {
    setIsHovering(false);
    setHoveredIndex(null);
  };

  return (
    <div
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={handleContainerLeave}
      className="group relative bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-3.5 md:p-6 backdrop-blur-sm transition-all duration-500 hover:border-brand-blue/20 hover:shadow-lg hover:shadow-brand-blue/5"
    >
      {/* Header: solo "Ventas" y una flecha; el total y la variacion se despliegan al tocarla */}
      <div className="mb-3 md:mb-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-dark">Ventas</h3>
          <button
            type="button"
            aria-label={showSummary ? "Ocultar detalle de ventas" : "Ver detalle de ventas"}
            aria-expanded={showSummary}
            onClick={() => setShowSummary((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-brand-light hover:text-brand-dark"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showSummary && "rotate-180")} strokeWidth={2.25} />
          </button>
        </div>

        {(showSummary || (isHovering && hoveredPoint)) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-[18px]">
            <span
              className={cn(
                "text-xs font-medium tabular-nums transition-all duration-300 ease-out",
                isHovering && hoveredPoint ? "text-brand-blue" : "text-brand-gray"
              )}
            >
              {isHovering && hoveredPoint
                ? `${hoveredPoint.label}: ${formatCurrency(hoveredPoint.total)}`
                : `Total: ${formatCurrency(total)}`}
            </span>
            {showSummary && (
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-1 rounded-full",
                  isPositive ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10" : "text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
                )}
              >
                {isPositive ? "+" : ""}
                {growth}% vs periodo anterior
              </span>
            )}
          </div>
        )}
      </div>

      {/* Range toggle */}
      <div className="flex items-center justify-between gap-3 mb-3 md:mb-6">
        <div className="flex items-center gap-1 bg-brand-light rounded-2xl border border-gray-100 p-1 w-fit">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onRangeChange(opt.value)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200",
                range === opt.value
                  ? "bg-brand-blue text-white shadow-md shadow-brand-blue/25"
                  : "text-brand-gray hover:text-brand-dark"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Link href="/dashboard/reportes" className="hidden sm:block text-xs text-brand-blue font-medium hover:underline shrink-0">
          Ver reportes →
        </Link>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-brand-gray">Cargando...</div>
      ) : data.every((d) => d.total === 0) ? (
        <div className="h-40 flex items-center justify-center text-sm text-brand-gray">Sin ventas en este periodo</div>
      ) : (
        <div className="flex items-end gap-1 h-28 md:h-40">
          {data.map((item, index) => {
            const heightPx = Math.max((item.total / maxValue) * 152, item.total > 0 ? 4 : 2);
            const isHovered = hoveredIndex === index;
            const isAnyHovered = hoveredIndex !== null;
            const isNeighbor = isAnyHovered && (index === hoveredIndex - 1 || index === hoveredIndex + 1);
            const showLabel = index % labelStride === 0 || index === data.length - 1;

            return (
              <div
                key={item.date}
                className="relative flex-1 flex flex-col items-center justify-end h-full"
                onMouseEnter={() => setHoveredIndex(index)}
              >
                {/* Tooltip */}
                <div
                  className={cn(
                    // Tooltip oscuro fijo (no brand-dark): brand-dark se invierte a casi-blanco
                    // en tema oscuro (para el texto), asi que usarlo de fondo aca dejaria el
                    // tooltip blanco sobre blanco.
                    "absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] font-medium transition-all duration-200 whitespace-nowrap z-10 pointer-events-none",
                    isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                  )}
                >
                  {formatCurrency(item.total)}
                </div>

                {/* Bar */}
                <div
                  className={cn(
                    "w-full max-w-[22px] rounded-full cursor-pointer transition-all duration-300 ease-out origin-bottom",
                    isHovered
                      ? "bg-gradient-to-t from-brand-blue to-emerald-400"
                      : isNeighbor
                      ? "bg-brand-blue/40"
                      : isAnyHovered
                      ? "bg-brand-blue/15"
                      : item.total > 0
                      ? "bg-brand-blue/25 group-hover:bg-brand-blue/30"
                      : "bg-gray-100 dark:bg-white/10"
                  )}
                  style={{
                    height: `${heightPx}px`,
                    transform: isHovered ? "scaleX(1.15)" : isNeighbor ? "scaleX(1.05)" : "scaleX(1)",
                  }}
                />

                {/* Label */}
                <span
                  className={cn(
                    "text-[9px] font-medium mt-2 transition-colors duration-200 truncate max-w-full",
                    !showLabel && "opacity-0",
                    isHovered ? "text-brand-blue" : "text-brand-gray/70"
                  )}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtle glow on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-brand-blue/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </div>
  );
}
