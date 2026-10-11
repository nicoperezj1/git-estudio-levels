"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { SupportForm } from "@/components/support/support-form";

// Boton flotante "¿Necesitas ayuda?" + ventana con el formulario de soporte.
// No estorba: se muestra al entrar y a los pocos segundos se esconde contra el borde (solo asoma el icono).
// Reaparece al acercar el mouse o el dedo a la esquina, al subir con el scroll, o al tocar el icono.
// En pantallas donde estorbaria mas (Punto de Venta y Standby) es siempre un circulo pequeno.
const SHOW_MS = 6000;      // visible al entrar
const IDLE_MS = 3500;      // tras acercarse o subir el scroll, vuelve a esconderse a los 3,5 s

// Pantalla de inicio de cada rol: ahi (y solo ahi) aparece el boton. En el resto, la ayuda sigue en el menu (Ayuda y soporte).
const HOME_BY_ROLE: Record<string, string> = { barber: "/dashboard/mi-agenda", receptionist: "/dashboard/caja" };
const OFF_KEY = "support_widget_off";

export function SupportWidget({ role }: { role?: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(true);
  // El usuario puede cerrar el boton para siempre (X); la ayuda sigue en el menu.
  const [off, setOff] = useState(true);
  useEffect(() => { try { setOff(localStorage.getItem(OFF_KEY) === "1"); } catch { setOff(false); } }, []);
  const pathname = usePathname() || "";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);
  const openRef = useRef(false);
  const wasHidden = useRef(false);
  const lastTops = useRef(new WeakMap<object, number>());

  useEffect(() => { openRef.current = open; }, [open]);

  const hideSoon = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!hovering.current && !openRef.current) setShown(false);
    }, ms);
  }, []);
  const reveal = useCallback((ms = IDLE_MS) => { setShown(true); hideSoon(ms); }, [hideSoon]);

  useEffect(() => {
    hideSoon(SHOW_MS);

    // Scroll hacia abajo: se esconde. Hacia arriba: asoma un momento. (El scroll del panel es del <main>, no de la ventana: por eso se escucha en captura.)
    const onScroll = (e: Event) => {
      const t = e.target as any;
      const el = t === document ? document.scrollingElement : t;
      const top = el && typeof el.scrollTop === "number" ? el.scrollTop : 0;
      const prev = lastTops.current.get(el || document) ?? top;
      lastTops.current.set(el || document, top);
      if (Math.abs(top - prev) < 4) return;
      if (top > prev) { if (!hovering.current) setShown(false); }
      else reveal();
    };
    // Mouse cerca de la esquina inferior derecha (escritorio): aparece.
    const onMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      const dx = window.innerWidth - e.clientX;
      const dy = window.innerHeight - e.clientY;
      if (dx < 170 && dy < 150) reveal(2500);
    };
    // Dedo cerca de la esquina inferior izquierda (celular): aparece.
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (window.innerWidth >= 1024) {
        if (window.innerWidth - t.clientX < 150 && window.innerHeight - t.clientY < 170) reveal();
      } else if (t.clientX < 110 && window.innerHeight - t.clientY < 230) reveal();
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouch);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hideSoon, reveal]);

  // Al cambiar de pantalla asoma un instante y se vuelve a esconder.
  useEffect(() => { reveal(2500); }, [pathname, reveal]);

  const home = HOME_BY_ROLE[role || ""] || "/dashboard";
  if (off || pathname !== home) return null;
  const compact = false;
  const expanded = shown && !open;

  return (
    <>
      <div
        className={`fixed z-40 left-0 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:left-auto lg:right-0 lg:bottom-6 transition-transform duration-300 ease-out ${
          expanded ? "translate-x-4 lg:-translate-x-6" : "-translate-x-1/2 lg:translate-x-1/2"
        } ${open ? "pointer-events-none opacity-0" : ""}`}
      >
      <button
        type="button"
        onPointerDown={() => { wasHidden.current = !shown; }}
        onClick={() => {
          // Con el dedo, el primer toque solo lo muestra; el segundo abre la ayuda.
          if (wasHidden.current && window.matchMedia("(pointer: coarse)").matches) { reveal(); return; }
          setOpen(true);
        }}
        onMouseEnter={() => { hovering.current = true; setShown(true); }}
        onMouseLeave={() => { hovering.current = false; hideSoon(1200); }}
        onFocus={() => setShown(true)}
        aria-label="¿Necesitas ayuda?"
        className={`relative flex items-center rounded-full bg-gradient-to-r from-brand-blue to-emerald-500 font-bold text-white shadow-lg shadow-brand-blue/30 transition-all duration-300 ease-out ${
          expanded
            ? `opacity-100 ${compact ? "h-11 w-11 justify-center" : "gap-2 py-2.5 pl-4 pr-4 text-sm"}`
            : "opacity-70 h-11 w-11 justify-center hover:opacity-100"
        } ${open ? "pointer-events-none opacity-0" : ""}`}
      >
        <LifeBuoy className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
        {expanded && !compact && <span className="whitespace-nowrap">¿Necesitas ayuda?</span>}
      </button>
        {expanded && (
          <button
            type="button"
            aria-label="Ocultar el botón de ayuda"
            title="Ocultar (la ayuda sigue en el menú)"
            onClick={() => { try { localStorage.setItem(OFF_KEY, "1"); } catch { /* sin almacenamiento */ } setOff(true); }}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white shadow ring-2 ring-white hover:bg-black"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-brand-dark">¿Necesitas ayuda?</h2>
                <p className="text-xs text-brand-gray">Cuéntanos qué pasó y lo solucionamos.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 text-brand-gray hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SupportForm onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
