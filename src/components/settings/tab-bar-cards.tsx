"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { TabBarEditor } from "@/components/settings/tab-bar-editor";
import type { TabRole } from "@/lib/mobile-tabs";

const box = "rounded-2xl border border-gray-100 bg-white p-4 md:p-5 space-y-3";

// Mi Perfil: los atajos propios de la barra inferior del celular.
export function MyTabBarCard() {
  const { effectiveRole, role } = useAuth();
  const r = effectiveRole || role || "barber";
  return (
    <div className={box}>
      <div>
        <h2 className="font-bold text-brand-dark">Barra inferior del celular</h2>
        <p className="text-xs text-brand-gray">Elige hasta 4 atajos para tu barra. Solo salen los que tu cargo y tu plan permiten.</p>
      </div>
      <TabBarEditor target="me" role={r} />
    </div>
  );
}

// Configuracion (solo administrador): los atajos por defecto de cada cargo del negocio.
export function TeamTabBarCard() {
  const [role, setRole] = useState<TabRole>("admin");
  const opts: Array<{ v: TabRole; l: string }> = [
    { v: "admin", l: "Administrador" },
    { v: "receptionist", l: "Recepción" },
    { v: "barber", l: "Profesional" },
  ];
  return (
    <div className={box}>
      <div>
        <h2 className="font-bold text-brand-dark">Barra inferior del equipo (celular)</h2>
        <p className="text-xs text-brand-gray">Define los atajos con los que parte cada cargo. Cada persona después puede cambiar los suyos en Mi Perfil.</p>
      </div>
      <div className="inline-flex flex-wrap rounded-2xl border border-gray-100 bg-brand-light p-1">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setRole(o.v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${role === o.v ? "bg-brand-blue text-white shadow-md shadow-brand-blue/25" : "text-brand-gray hover:text-brand-dark"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
      <TabBarEditor key={role} target={{ role }} role={role} />
    </div>
  );
}
