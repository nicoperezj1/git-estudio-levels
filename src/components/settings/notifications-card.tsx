"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

// Interruptor del centro de avisos (Configuración, solo administrador). Apagado por defecto.
export function NotificationsCard() {
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notificaciones").then((r) => r.json()).then((d) => {
      if (d?.error) return;
      setEnabled(!!d.enabled); setMissing(!!d.migrationMissing); setLoaded(true);
    }).catch(() => {});
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const r = await fetch("/api/settings/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo guardar");
      setEnabled(next);
      window.dispatchEvent(new Event("rb:notifications-changed"));
      showToast(next ? "Avisos activados" : "Avisos apagados", "success");
    } catch (e: any) { showToast(e?.message || "No se pudo guardar", "error"); } finally { setSaving(false); }
  };

  if (!loaded) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-brand-white md:p-6">
      <div>
        <h2 className="font-bold text-brand-dark">Avisos y notificaciones</h2>
        <p className="text-xs text-brand-gray">Bandeja de avisos con campanita, mensajes tuyos al equipo y avisos automáticos (nuevas citas, cambios, descuentos por planilla, problemas de caja).</p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={enabled} disabled={saving || missing} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>
          <span className="block text-sm font-medium text-brand-dark">Activar el centro de avisos</span>
          <span className="block text-xs text-brand-gray">Cada persona elige qué avisos recibe y su horario de silencio en Avisos. Apagado, los avisos de nuevas citas siguen llegando como siempre.</span>
        </span>
      </label>
      {missing && <p className="text-xs text-red-500">Falta aplicar la migración 100 en la base de datos.</p>}
    </div>
  );
}
