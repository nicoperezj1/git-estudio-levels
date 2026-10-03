"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarDays, Home, Menu, PiggyBank, ShoppingCart, Users, Wallet } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

// Barra inferior para celular (Fase 1 de la app móvil). Atajos al pulgar según el rol; "Más" abre el menú
// completo de siempre (el mismo del lateral). Solo se ve en pantallas chicas (lg:hidden) y no en el
// Standby, que es una pantalla completa de tablet. En escritorio no cambia nada.
type Tab = { label: string; href: string; icon: any; feature?: string };

const TABS: Record<string, Tab[]> = {
  barber: [
    { label: "Mi agenda", href: "/dashboard/mi-agenda", icon: CalendarCheck },
    { label: "Calendario", href: "/dashboard/calendario", icon: CalendarDays },
    { label: "Clientes", href: "/dashboard/clientes", icon: Users },
    { label: "Billetera", href: "/dashboard/mi-billetera", icon: PiggyBank },
  ],
  receptionist: [
    { label: "Calendario", href: "/dashboard/calendario", icon: CalendarDays },
    { label: "Venta", href: "/dashboard/pos", icon: ShoppingCart },
    { label: "Clientes", href: "/dashboard/clientes", icon: Users },
    { label: "Caja", href: "/dashboard/caja", icon: Wallet, feature: "cash_register" },
  ],
  admin: [
    { label: "Inicio", href: "/dashboard", icon: Home },
    { label: "Calendario", href: "/dashboard/calendario", icon: CalendarDays },
    { label: "Venta", href: "/dashboard/pos", icon: ShoppingCart },
    { label: "Clientes", href: "/dashboard/clientes", icon: Users },
  ],
};

export const OPEN_MENU_EVENT = "rb:open-menu";

export function MobileTabBar({ role }: { role: string }) {
  const pathname = usePathname() || "";
  const { hasPlanFeature } = useTenant();
  if (pathname.startsWith("/dashboard/standby")) return null;

  const key = role === "super_admin" ? "admin" : role;
  const tabs = (TABS[key] || TABS.barber).filter((t) => !t.feature || hasPlanFeature(t.feature));
  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-brand-white/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {tabs.map(({ label, href, icon: Icon }) => {
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
