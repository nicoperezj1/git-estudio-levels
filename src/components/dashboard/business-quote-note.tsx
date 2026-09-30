"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { BUSINESS_QUOTES } from "@/lib/business-quotes";

// Frases de libros de negocios para administradores (Nico, 29-sep). Version discreta: una
// franja fina, en los mismos tonos neutros del dashboard, que se desliza como carrusel.
// Se pausa al pasar el cursor; cada dia arranca en una frase distinta.

const ROTATE_MS = 12000;

function dayIndex(total: number) {
  const d = new Date();
  const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  return seed % total;
}

export function BusinessQuoteNote() {
  const total = BUSINESS_QUOTES.length;
  const start = useMemo(() => dayIndex(total), [total]);
  const [index, setIndex] = useState(start);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || total <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % total), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, total]);

  if (total === 0) return null;
  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-black/5 bg-brand-white/60 px-4 py-3 dark:border-white/5"
    >
      <Quote className="h-4 w-4 flex-shrink-0 text-brand-blue/50" strokeWidth={1.75} />

      {/* Carrusel: pista que se desplaza en horizontal */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className="flex transition-transform duration-1000 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {BUSINESS_QUOTES.map((q, i) => (
            <div
              key={i}
              aria-hidden={i !== index}
              className={`w-full flex-shrink-0 pr-4 transition-opacity duration-1000 ${i === index ? "opacity-100" : "opacity-0"}`}
            >
              <p className="truncate text-[13px] italic text-brand-dark/80" title={q.text}>
                “{q.text}”
              </p>
              <p className="mt-0.5 truncate text-[11px] text-brand-gray">
                {q.author} · <span className="italic">{q.book}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Frase anterior"
            onClick={() => go(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-black/5 hover:text-brand-dark dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Frase siguiente"
            onClick={() => go(1)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-black/5 hover:text-brand-dark dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
