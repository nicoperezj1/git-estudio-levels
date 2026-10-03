"use client";

import Link from "next/link";
import { Plane, Percent, KeyRound, Tag, Truck, FileText } from "lucide-react";

// Mi negocio: todo lo que el administrador maneja del negocio, en un solo lugar.
const ITEMS = [
  { href: "/dashboard/vacaciones", title: "Vacaciones", desc: "Días en que un profesional no atiende: se bloquea su agenda y la reserva online.", icon: Plane },
  { href: "/dashboard/comisiones", title: "Comisiones", desc: "Lo que ganó cada profesional por comisión, con sus movimientos del mes.", icon: Percent },
  { href: "/dashboard/arriendo", title: "Arriendo", desc: "Días trabajados y cobro de los profesionales que arriendan.", icon: KeyRound },
  { href: "/dashboard/servicios", title: "Servicios", desc: "Tu carta de servicios, categorías y el orden en que se ve al reservar.", icon: Tag },
  { href: "/dashboard/proveedores", title: "Proveedores", desc: "Tus proveedores y las cotizaciones por WhatsApp.", icon: Truck },
  // Remuneraciones oculta a los negocios hasta terminar las pruebas (se reactiva descomentando)
  // { href: "/dashboard/remuneraciones", title: "Remuneraciones", desc: "Liquidaciones de sueldo de tus trabajadores con contrato.", icon: FileText },
];

export default function MiNegocioPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Mi negocio</h1>
        <p className="text-sm text-brand-gray">Lo que administras de tu negocio.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map(({ href, title, desc, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-brand-blue/40 hover:shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"><Icon className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-brand-dark">{title}</span><span className="block text-xs text-brand-gray">{desc}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
