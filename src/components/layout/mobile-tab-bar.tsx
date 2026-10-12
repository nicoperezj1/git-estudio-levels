"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { resolveTabs, type TabPrefs } from "@/lib/mobile-tabs";
import { TAB_ICONS } from "@/components/layout/tab-icons";

// Barra inferior para celular. Atajos al pulgar: cada usuario elige hasta 4 (Mi Perfil), el administrador fija los
// del negocio por rol (Configuracion) y, si nadie eligio, quedan los de siempre segun el rol. Solo salen los que
// el rol y el plan permiten. "Más" abre el menu completo (el mismo del lateral). Solo se ve en pantallas chicas
// (lg:hidden) y no en el Standby. En escritorio no cambia nada.
export const TABS_CHANGED_EVENT = "rb:tabs-changed";
const CACHE_KEY = "rb_tab_prefs";

export const OPEN_MENU_EVENT = "rb:open-menu";

export function MobileTabBar({ role }: { role: string }) {
  const pathname = usePathname() || "";
  const { hasPlanFeature, tenant, isOverriding } = useTenant();
  const [prefs, setPrefs] = useState<TabPrefs | null>(null);

  const load = useCallback(() => {
    fetch("/api/mobile-tabs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        const next: TabPrefs = { mine: d.mine || null, tenant: d.tenant || null };
        setPrefs(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Lo ultimo que se supo se muestra al instante; luego se actualiza desde el servidor.
    try { const c = localStorage.getItem(CACHE_KEY); if (c) setPrefs(JSON.parse(c)); } catch { /* ignorar */ }
    load();
    window.addEventListener(TABS_CHANGED_EVENT, load);
    return () => window.removeEventListener(TABS_CHANGED_EVENT, load);
  }, [load]);

  if (pathname.startsWith("/dashboard/standby")) return null;

  // Super admin sin empresa elegida: atajos de plataforma (lo del negocio aparece al entrar a una empresa).
  const platformTabs = [
    { label: "Inicio", href: "/dashboard", icon: "home" },
    { label: "Empresas", href: "/dashboard/superadmin/tenants", icon: "building" },
    { label: "Auditoría", href: "/dashboard/superadmin/audit", icon: "shield" },
    { label: "Perfil", href: "/dashboard/mi-perfil", icon: "user" },
  ];
  const tabs = role === "super_admin" && !isOverriding
    ? platformTabs
    : resolveTabs(role, prefs, { hasPlanFeature, plan: tenant?.plan });
  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-brand-white/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {tabs.map(({ label, href, icon }) => {
          const Icon = TAB_ICONS[icon] || Menu;
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => { try { navigator.vibrate?.(8); } catch {} }}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition-colors active:scale-95",
                  active ? "text-brand-blue" : "text-brand-gray"
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
            className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold text-brand-gray transition-colors active:scale-95"
          >
            <Menu className="h-6 w-6" strokeWidth={1.75} />
            <span>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
