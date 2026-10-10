"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Piezas compartidas del look "premium" (Nico, 29-sep): mismo lenguaje visual que el POS
// rediseñado — tarjetas redondeadas con borde fino, iconos en baldosas con degradado,
// numeros grandes con cifras tabulares y controles segmentados. Se usan en Dashboard,
// Ingresos/Egresos y Cierre Mensual, y sirven para llevar el mismo estilo a otras pantallas.

export type Tone = "teal" | "green" | "red" | "amber" | "violet" | "slate";

const TONES: Record<Tone, { tile: string; text: string }> = {
  teal: { tile: "from-brand-blue/25 to-brand-accent/10 text-brand-blue ring-brand-blue/20", text: "text-brand-blue" },
  green: { tile: "from-emerald-500/25 to-emerald-300/10 text-emerald-500 ring-emerald-500/20", text: "text-emerald-500" },
  red: { tile: "from-red-500/25 to-red-300/10 text-red-500 ring-red-500/20", text: "text-red-500" },
  amber: { tile: "from-amber-500/25 to-amber-300/10 text-amber-500 ring-amber-500/20", text: "text-amber-500" },
  violet: { tile: "from-violet-500/25 to-violet-300/10 text-violet-500 ring-violet-500/20", text: "text-violet-500" },
  slate: { tile: "from-slate-500/20 to-slate-300/5 text-brand-gray ring-slate-400/20", text: "text-brand-dark" },
};

export function IconTile({ Icon, tone = "teal", size = 40 }: { Icon: LucideIcon; tone?: Tone; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${TONES[tone].tile}`}
    >
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={1.75} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-brand-dark md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-brand-gray md:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Delta({ value, invert = false, suffix }: { value: number; invert?: boolean; suffix?: string }) {
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        good ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
      }`}
    >
      {value >= 0 ? "▲" : "▼"} {Math.abs(value)}%
      {suffix && <span className="font-normal opacity-70">{suffix}</span>}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  Icon,
  tone = "teal",
  hero = false,
  delta,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  Icon: LucideIcon;
  tone?: Tone;
  hero?: boolean;
  delta?: { value: number; invert?: boolean; suffix?: string };
  className?: string;
}) {
  if (hero) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue to-emerald-500 p-4 text-white md:p-5 shadow-lg shadow-brand-blue/25 ${className}`}
      >
        <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
        <span className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/80">{label}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25 md:h-9 md:w-9">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
        </div>
        <div className="relative mt-2 flex items-end justify-between gap-2 md:mt-3 md:block">
        <p className="text-2xl font-black leading-none tracking-tight tabular-nums md:text-4xl">{value}</p>
        <div className="flex flex-wrap items-center gap-2 md:mt-3">
          {delta && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
              {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value)}%
              {delta.suffix && <span className="font-normal opacity-80">{delta.suffix}</span>}
            </span>
          )}
          {hint && <span className="text-[11px] text-white/70">{hint}</span>}
        </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 transition-all duration-300 hover:-translate-y-0.5 md:p-5 hover:border-brand-blue/30 hover:shadow-lg hover:shadow-black/5 ${className}`}
    >
      <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-blue/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-brand-gray">{label}</p>
        <IconTile Icon={Icon} tone={tone} size={30} />
      </div>
      <div className="relative mt-1.5 flex items-end justify-between gap-1.5 md:mt-2 md:block">
        <p className="text-xl font-extrabold leading-none tracking-tight text-brand-dark tabular-nums md:text-[28px]">
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-2 md:mt-2.5">
          {delta && <Delta {...delta} />}
          {hint && <span className="text-[11px] text-brand-gray">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  flush = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 md:px-5 md:pb-3 md:pt-4">
          <div>
            {title && (
              <div className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
                <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-dark">{title}</h3>
              </div>
            )}
            {subtitle && <p className="mt-0.5 pl-4 text-[11px] text-brand-gray">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "px-4 pb-4 md:px-5 md:pb-5"}>{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap rounded-2xl border border-gray-100 bg-brand-light p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-xl font-semibold transition-all ${size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${
              active ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "text-brand-gray hover:text-brand-dark"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Clases compartidas para tablas del look premium. */
export const tableStyles = {
  wrap: "overflow-x-auto",
  table: "w-full text-sm",
  thead: "border-b border-gray-100",
  th: "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-gray",
  thRight: "px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-gray",
  thCenter: "px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-gray",
  tbody: "divide-y divide-gray-50",
  tr: "transition-colors hover:bg-brand-blue/[0.04]",
  td: "px-5 py-3.5 text-brand-dark",
  tdRight: "px-5 py-3.5 text-right font-semibold tabular-nums",
  tdCenter: "px-5 py-3.5 text-center tabular-nums",
};

export const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-blue to-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-blue/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";
export const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-dark transition-colors hover:border-brand-blue/40";
