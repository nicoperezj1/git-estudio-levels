"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { SupportForm } from "@/components/support/support-form";

// Boton flotante "¿Necesitas ayuda?" + ventana con el formulario de soporte.
// En pantallas donde el boton estorbaria (Punto de Venta y Standby) queda como un circulo pequeno.
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";
  if (pathname.startsWith("/dashboard/soporte")) return null;
  const compact = pathname.startsWith("/dashboard/pos") || pathname.startsWith("/dashboard/standby");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="¿Necesitas ayuda?"
        style={{ bottom: compact ? "calc(8rem + env(safe-area-inset-bottom, 0px))" : undefined }}
        className={`fixed z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-blue to-emerald-500 font-bold text-white shadow-lg shadow-brand-blue/30 transition-all hover:brightness-110 active:scale-95 left-4 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:left-auto lg:right-6 ${compact ? "lg:bottom-28" : "lg:bottom-6"} ${compact ? "h-11 w-11 justify-center" : "px-4 py-2.5 text-sm"}`}
      >
        <LifeBuoy className="h-5 w-5" strokeWidth={1.75} />
        {!compact && <span>¿Necesitas ayuda?</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand-dark">¿Necesitas ayuda?</h2>
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
