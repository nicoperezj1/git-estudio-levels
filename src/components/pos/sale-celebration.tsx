"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

// Celebracion de "Venta exitosa" del POS (Nico, 29-sep): confeti que sale en abanico desde
// detras de la tarjeta (piezas finas de varios tamanos, en la paleta de la marca + dorado),
// tarjeta que entra con un resorte suave, check que se dibuja, monto que sube contando y
// textos que aparecen escalonados. Todo dura ~2s y es sutil; respeta "reducir movimiento".

const COLORS = ["#2EC4B6", "#0F8B8D", "#F5C542", "#8FE3D6", "#FFFFFF", "#F2A65A"];

interface Piece {
  dx: number;
  up: number;
  down: number;
  rot: number;
  delay: number;
  dur: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
}

function useCountUp(target: number, durationMs = 900, startDelayMs = 250) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const t = setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setValue(Math.round(target * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, startDelayMs);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs, startDelayMs]);
  return value;
}

export function SaleCelebration({ amount, onClose }: { amount: number; onClose: () => void }) {
  // Las piezas se generan una sola vez (evita que el confeti "salte" en cada re-render).
  const pieces = useMemo<Piece[]>(() => {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    return Array.from({ length: 56 }, (_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const round = i % 4 === 0;
      return {
        dx: side * r(60, 520),
        up: -r(120, 300),
        down: r(140, 420),
        rot: side * r(240, 900),
        delay: r(0, 0.18),
        dur: r(1.5, 2.3),
        w: round ? r(5, 8) : r(4, 7),
        h: round ? r(5, 8) : r(10, 18),
        color: COLORS[i % COLORS.length],
        round,
      };
    });
  }, []);

  const shown = useCountUp(amount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="Venta exitosa"
    >
      {/* Confeti: sale en abanico desde detras de la tarjeta */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[46%]">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="sale-confetti absolute block"
              style={
                {
                  width: p.w,
                  height: p.h,
                  backgroundColor: p.color,
                  borderRadius: p.round ? "9999px" : "2px",
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.dur}s`,
                  "--dx": `${p.dx}px`,
                  "--up": `${p.up}px`,
                  "--down": `${p.down}px`,
                  "--rot": `${p.rot}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="relative sale-card-in">
        {/* Halo suave que late una vez detras de la tarjeta */}
        <div
          className="sale-glow pointer-events-none absolute -inset-10 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(46,196,182,0.45), transparent)" }}
          aria-hidden="true"
        />

        {/* Borde en degradado fino */}
        <div className="relative rounded-[28px] p-px bg-gradient-to-b from-brand-blue/60 via-brand-blue/10 to-transparent shadow-2xl">
          <div className="rounded-[27px] bg-white px-10 py-9 text-center min-w-[300px] max-w-sm">
            {/* Check que se dibuja */}
            <div className="relative mx-auto mb-5 h-[76px] w-[76px]">
              <span className="sale-ring absolute inset-0 rounded-full bg-brand-blue/15" aria-hidden="true" />
              <svg viewBox="0 0 76 76" className="relative h-full w-full" fill="none" aria-hidden="true">
                <circle cx="38" cy="38" r="33" className="stroke-brand-blue" strokeWidth="3" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1" style={{ animation: "sale-draw 0.55s 0.15s ease-out forwards" }} />
                <path d="M25 39.5l9 9 17-19" className="stroke-brand-blue" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1" style={{ animation: "sale-draw 0.4s 0.55s ease-out forwards" }} />
              </svg>
            </div>

            <h2 className="sale-rise text-xl font-bold tracking-tight text-brand-dark" style={{ animationDelay: "0.25s" }}>
              ¡Venta exitosa!
            </h2>
            <p
              className="sale-rise mt-2 text-[44px] leading-none font-black tracking-tight text-brand-blue tabular-nums"
              style={{ animationDelay: "0.35s" }}
            >
              {formatCurrency(shown)}
            </p>
            <p className="sale-rise mt-3 text-sm text-brand-gray" style={{ animationDelay: "0.5s" }}>
              Registrada correctamente
            </p>
            <div className="sale-rise mt-5 flex flex-wrap items-center justify-center gap-1.5" style={{ animationDelay: "0.65s" }}>
              {["Stock actualizado", "Boleta enviada", "Puntos acreditados"].map((t) => (
                <span key={t} className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-medium text-brand-blue">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
