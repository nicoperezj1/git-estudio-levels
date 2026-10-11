"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Menu, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { MAX_TABS, TAB_CATALOG, DEFAULT_TABS, tabAvailable, toTabRole, type TabRole } from "@/lib/mobile-tabs";
import { TAB_ICONS } from "@/components/layout/tab-icons";
import { TABS_CHANGED_EVENT } from "@/components/layout/mobile-tab-bar";
import { primaryButton } from "@/components/ui/premium";

// Editor de la barra inferior del celular.
//   target = "me"            -> los atajos de la persona que esta mirando (Mi Perfil)
//   target = { role: ... }   -> los atajos por defecto del negocio para ese rol (Configuracion, solo administrador)
export function TabBarEditor({ target, role }: { target: "me" | { role: TabRole }; role: string }) {
  const { showToast } = useToast();
  const { hasPlanFeature, tenant } = useTenant();
  const forRole: TabRole = target === "me" ? toTabRole(role) : target.role;
  const [keys, setKeys] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[] | null>(null);   // lo guardado (null = sin eleccion propia)
  const [inherited, setInherited] = useState<string[]>([]);    // lo que se ve si no hay eleccion propia
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const available = useMemo(
    () => TAB_CATALOG.filter((t) => tabAvailable(t, forRole, { hasPlanFeature, plan: tenant?.plan })),
    [forRole, hasPlanFeature, tenant?.plan]
  );
  const availKeys = useMemo(() => new Set(available.map((t) => t.key)), [available]);

  useEffect(() => {
    setLoaded(false);
    fetch("/api/mobile-tabs").then((r) => r.json()).then((d) => {
      setMissing(!!d?.migrationMissing);
      const own: string[] | null = target === "me" ? d?.mine || null : d?.tenant?.[forRole] || null;
      const base: string[] = target === "me" ? d?.tenant?.[forRole] || DEFAULT_TABS[forRole] : DEFAULT_TABS[forRole];
      setSaved(own);
      setInherited(base);
      setKeys((own || base).filter((k) => availKeys.has(k)).slice(0, MAX_TABS));
      setLoaded(true);
    }).catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forRole, target === "me"]);

  const move = (i: number, d: -1 | 1) => setKeys((k) => { const n = [...k]; const j = i + d; if (j < 0 || j >= n.length) return k; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const byKey = (k: string) => TAB_CATALOG.find((t) => t.key === k)!;

  const send = async (next: string[] | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/mobile-tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target === "me" ? { scope: "me", keys: next } : { scope: "tenant", role: forRole, keys: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error || "No se pudo guardar", "error"); return; }
      setSaved(next);
      if (next === null) setKeys(inherited.filter((k) => availKeys.has(k)).slice(0, MAX_TABS));
      window.dispatchEvent(new Event(TABS_CHANGED_EVENT));
      showToast(next ? "Barra inferior guardada" : "Barra inferior restablecida", "success");
    } finally { setBusy(false); }
  };

  if (!loaded) return <p className="text-xs text-brand-gray">Cargando…</p>;

  const changed = JSON.stringify(keys) !== JSON.stringify((saved || inherited).filter((k) => availKeys.has(k)).slice(0, MAX_TABS));
  const rest = available.filter((t) => !keys.includes(t.key));

  return (
    <div className="space-y-2.5">
      {/* Vista previa */}
      <div className="rounded-2xl border border-gray-100 bg-brand-light p-2">
        <ul className="flex items-stretch justify-around">
          {keys.map((k) => { const d = byKey(k); const I = TAB_ICONS[d.icon] || Menu; return (
            <li key={k} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-brand-blue">
              <I className="h-5 w-5" strokeWidth={1.75} /><span className="max-w-full truncate text-[10px] font-semibold">{d.label}</span>
            </li>
          ); })}
          <li className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-brand-gray">
            <Menu className="h-5 w-5" strokeWidth={1.75} /><span className="text-[10px] font-semibold">Más</span>
          </li>
        </ul>
      </div>

      {/* Elegidos, en orden */}
      <div className="space-y-1.5">
        {keys.map((k, i) => { const d = byKey(k); const I = TAB_ICONS[d.icon] || Menu; return (
          <div key={k} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-2 py-1">
            <I className="h-4 w-4 flex-shrink-0 text-brand-blue" strokeWidth={1.75} />
            <span className="flex-1 truncate text-[13px] font-semibold text-brand-dark">{d.label}</span>
            <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-brand-gray hover:text-brand-dark disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Bajar" disabled={i === keys.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-brand-gray hover:text-brand-dark disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Quitar" disabled={keys.length <= 1} onClick={() => setKeys((x) => x.filter((y) => y !== k))} className="rounded p-1 text-brand-gray hover:text-red-500 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
          </div>
        ); })}
      </div>

      {/* Disponibles para agregar */}
      {rest.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-brand-gray">
            {keys.length >= MAX_TABS ? `Ya elegiste ${MAX_TABS}. Quita uno para cambiarlo.` : `Agregar (hasta ${MAX_TABS}):`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rest.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={keys.length >= MAX_TABS}
                onClick={() => setKeys((x) => [...x, t.key])}
                className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-gray transition-colors hover:border-brand-blue/50 hover:text-brand-dark disabled:opacity-40"
              >
                <Plus className="h-2.5 w-2.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {missing && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">Falta aplicar la migración 108 para guardar la barra inferior.</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" disabled={busy || saved === null} onClick={() => send(null)} className="text-xs font-semibold text-brand-gray hover:text-brand-dark disabled:opacity-40">
          {target === "me" ? "Usar la del negocio" : "Volver a la de siempre"}
        </button>
        <button type="button" disabled={busy || !changed || keys.length === 0} onClick={() => send(keys)} className={`${primaryButton} !px-4 !py-2`}>
          {busy ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
