"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, DollarSign, ShoppingCart, Package, Users,
  Calendar, CalendarCheck, CalendarDays, MapPin, Receipt, BarChart3,
  Tablet, CreditCard, Tag, Settings, LogOut, Scissors, Menu, X,
  Heart, Bell, Zap, Image, Star, ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: any;
  minRole: Role; // minimum role required to see this item
  // Punto (Nico, 25-sep): sub-paginas anidadas bajo un item padre (Clientes, Calendario,
  // Configuracion), para comprimir la barra lateral — el padre sigue siendo un link a su
  // propia pagina, y un chevron aparte expande/colapsa sus hijos.
  children?: NavItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Principal",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: "admin" },
      { name: "Caja", href: "/dashboard/caja", icon: Wallet, minRole: "admin" },
      { name: "Punto de Venta", href: "/dashboard/pos", icon: ShoppingCart, minRole: "receptionist" },
      { name: "Standby", href: "/dashboard/standby", icon: Zap, minRole: "barber" },
    ],
  },
  {
    title: "Clientes",
    items: [
      {
        name: "Clientes", href: "/dashboard/clientes", icon: Users, minRole: "receptionist",
        // Punto (Nico, 25-sep): pedido de Pablo — comprimir la barra dejando Metricas,
        // Fidelidad y Retencion anidadas bajo Clientes en vez de como filas propias.
        children: [
          { name: "Métricas", href: "/dashboard/clientes/metricas", icon: BarChart3, minRole: "receptionist" },
          { name: "Fidelidad", href: "/dashboard/fidelidad", icon: Star, minRole: "admin" },
          { name: "Retencion", href: "/dashboard/retencion", icon: Heart, minRole: "admin" },
        ],
      },
      { name: "WhatsApp", href: "/dashboard/whatsapp", icon: Users, minRole: "admin" },
    ],
  },
  {
    title: "Agenda",
    items: [
      { name: "Mi Agenda", href: "/dashboard/mi-agenda", icon: CalendarCheck, minRole: "barber" },
      { name: "Agenda", href: "/dashboard/agenda", icon: Calendar, minRole: "receptionist" },
      {
        name: "Calendario", href: "/dashboard/calendario", icon: CalendarDays, minRole: "receptionist",
        // Punto (Nico, 25-sep): Recepcion, Recordatorios y Lista Espera pasan a ser hijos
        // de Calendario (Lista Espera se muda desde la seccion Clientes).
        children: [
          { name: "Recepcion", href: "/dashboard/recepcion", icon: Tablet, minRole: "receptionist" },
          { name: "Recordatorios", href: "/dashboard/recordatorios", icon: Bell, minRole: "admin" },
          { name: "Lista Espera", href: "/dashboard/waitlist", icon: Users, minRole: "admin" },
        ],
      },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { name: "Ingresos/Egresos", href: "/dashboard/finanzas", icon: DollarSign, minRole: "admin" },
      { name: "Mi Billetera", href: "/dashboard/mi-billetera", icon: Wallet, minRole: "barber" },
      { name: "Cierre Mensual", href: "/dashboard/reportes", icon: BarChart3, minRole: "admin" },
      { name: "Boletas", href: "/dashboard/boletas", icon: Receipt, minRole: "admin" },
      { name: "Facturas", href: "/dashboard/facturas", icon: Receipt, minRole: "admin" },
    ],
  },
  {
    title: "Catalogo",
    items: [
      { name: "Cupones", href: "/dashboard/cupones", icon: CreditCard, minRole: "admin" },
      { name: "Precios", href: "/dashboard/precios", icon: Tag, minRole: "super_admin" },
      { name: "Galeria", href: "/dashboard/galeria", icon: Image, minRole: "admin" },
    ],
  },
  {
    title: "Equipo",
    items: [
      { name: "Mi Perfil", href: "/dashboard/mi-perfil", icon: Settings, minRole: "barber" },
      { name: "Profesionales", href: "/dashboard/barberos", icon: Scissors, minRole: "admin" },
      { name: "Sucursales", href: "/dashboard/sucursales", icon: MapPin, minRole: "admin" },
      { name: "Pagos", href: "/dashboard/pagos", icon: CreditCard, minRole: "admin" },
      {
        name: "Configuracion", href: "/dashboard/configuracion", icon: Settings, minRole: "admin",
        // Punto (Nico, 25-sep): Comisiones/Arriendo/Terminal POS (antes en Finanzas) y
        // Servicios/Inventario (antes en Catalogo) pasan a ser hijos de Configuracion.
        children: [
          { name: "Comisiones", href: "/dashboard/comisiones", icon: Zap, minRole: "barber" },
          { name: "Arriendo", href: "/dashboard/arriendo", icon: Zap, minRole: "admin" },
          { name: "Terminal POS", href: "/dashboard/terminal-pos", icon: CreditCard, minRole: "admin" },
          { name: "Servicios", href: "/dashboard/servicios", icon: Tag, minRole: "admin" },
          { name: "Inventario", href: "/dashboard/inventario", icon: Package, minRole: "admin" },
        ],
      },
    ],
  },
  {
    title: "Super Admin",
    items: [
      { name: "Empresas", href: "/dashboard/superadmin/tenants", icon: Users, minRole: "super_admin" },
      { name: "Auditoria", href: "/dashboard/superadmin/audit", icon: Receipt, minRole: "super_admin" },
      { name: "Sesiones", href: "/dashboard/superadmin/sesiones", icon: Tablet, minRole: "super_admin" },
      { name: "Horarios", href: "/dashboard/configuracion/horarios", icon: Calendar, minRole: "super_admin" },
    ],
  },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  tenantName?: string;
  // True when the business has only 1 active team member (a solo/independent
  // professional). Hides menu items that only make sense with a team, like
  // Recepcion, Lista de Espera and Arriendo.
  isSoloBusiness?: boolean;
}

// Routes that assume there's a team to manage — meaningless for a solo professional
// running their own account (nothing to "receive" clients for, no other professional
// to redirect a waitlist to). Arriendo (chair rental) is NOT hidden anymore: an
// independent professional (like Saray) rents her own chair and needs to track it —
// hiding it left her without a way to manage her rental.
const SOLO_BUSINESS_HIDDEN_ROUTES = ["/dashboard/recepcion", "/dashboard/waitlist"];

// Ocultas temporalmente a pedido de Pablo (2026-09-23): no se borra nada del codigo,
// solo se saca de la navegacion. Facil de revertir quitando la ruta de esta lista.
// - Precios y Galeria: quedan en pausa por ahora.
// - Pagos: es un formulario viejo que no guarda nada real (no hace POST a ningun API);
//   la config de pagos real vive en Terminal POS. Se oculta en vez de "moverla" para no
//   reabrir la confusion que ya se habia resuelto separando ambas cosas.
// - Agenda: se fusiona dentro de Calendario (que ahora tiene un toggle Calendario/Lista).
const TEMP_HIDDEN_ROUTES = [
  "/dashboard/precios",
  "/dashboard/galeria",
  "/dashboard/pagos",
  "/dashboard/agenda",
];

export function Sidebar({ userName, userRole, tenantName, isSoloBusiness }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Punto (Nico, 25-sep): expand/collapse por item padre (Clientes/Calendario/Configuracion),
  // separado de openSections que controla el titulo de seccion completo.
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isAtLeast, loading: authLoading, role: userAuthRole, user } = useAuth();
  // Bug (reportado por Nico, 26-sep): tenantName llega como prop desde el layout
  // (Server Component), calculado con el tenant_id REAL de la cuenta del super_admin —
  // ese componente corre en el servidor y no puede leer el override de localStorage.
  // Resultado: al "Entrar" a otro negocio (ej. Saray Business), el banner azul de arriba
  // decia "Viendo como: Saray Business" pero el nombre del sidebar seguia mostrando el
  // negocio real de la cuenta del super_admin (ej. Estudio Levels), dando la impresion de
  // datos cruzados. Se usa el tenant del contexto (que si respeta el override) cuando hay
  // uno activo, y se cae al valor del servidor en cualquier otro caso.
  const { tenant: overrideTenant, isOverriding } = useTenant();
  const effectiveTenantName = isOverriding && overrideTenant ? overrideTenant.name : tenantName;
  // Punto 15 (Pablo): el espacio de la foto en la esquina inferior izquierda siempre
  // mostraba solo iniciales, nunca la foto real, aunque el profesional ya tuviera una
  // cargada en su ficha (misma foto que usa Mi Perfil / Profesionales). userName/userRole
  // vienen como props del render en servidor (mas confiables), pero avatar_url solo esta
  // disponible via useAuth() en el cliente — no hace falta que sea "confiable" para esto,
  // es solo una imagen decorativa.
  const userAvatarUrl = user?.avatar_url || null;

  // Use the server-provided role (reliable) over client-side auth (unreliable on Vercel)
  const effectiveRole = userRole || userAuthRole || "barber";

  // Define what each role can see (explicit whitelist)
  const ROLE_MENU_ACCESS: Record<string, string[]> = {
    receptionist: [
      "/dashboard/pos", "/dashboard/clientes", "/dashboard/calendario",
      "/dashboard/agenda", "/dashboard/recepcion", "/dashboard/standby",
      "/dashboard/fidelidad", "/dashboard/retencion", "/dashboard/whatsapp",
      "/dashboard/boletas", "/dashboard/cupones", "/dashboard/configuracion",
      // Nico's request: receptionist also gets Caja, Profesionales (schedules only) and
      // Inventario (read-only, changes gated behind the admin PIN).
      "/dashboard/caja", "/dashboard/barberos", "/dashboard/inventario",
    ],
    barber: [
      "/dashboard/standby", "/dashboard/mi-agenda", "/dashboard/calendario",
      "/dashboard/clientes", "/dashboard/mi-billetera",
      "/dashboard/mi-perfil",
    ],
  };

  // Punto (Nico, 25-sep): antes era una cadena de 4 pasos .map()/.filter() que solo miraba
  // items de primer nivel. Con items anidados (Clientes/Calendario/Configuracion) el mismo
  // criterio (whitelist de rol, solo-negocio, oculto temporal) tiene que aplicarse tambien a
  // los hijos, asi que se reemplaza por una funcion recursiva. Devuelve null cuando el item
  // (padre o hijo) debe desaparecer por completo de la barra.
  const processItem = (item: NavItem): (NavItem & { locked?: boolean }) | null => {
    if (isSoloBusiness && SOLO_BUSINESS_HIDDEN_ROUTES.includes(item.href)) return null;
    if (TEMP_HIDDEN_ROUTES.includes(item.href)) return null;

    const whitelist = ROLE_MENU_ACCESS[effectiveRole];
    const locked = whitelist ? !whitelist.includes(item.href) : !isAtLeast(item.minRole);

    // Para roles con whitelist explicita (receptionist/barber): un item bloqueado se saca
    // por completo en vez de mostrarse como "PRO" — mismo comportamiento de antes, ahora
    // recursivo para que tambien aplique a los hijos.
    if (whitelist && locked) return null;

    const children = item.children
      ?.map(processItem)
      .filter((c): c is NavItem & { locked?: boolean } => c !== null);

    return { ...item, locked, children: children && children.length > 0 ? children : undefined };
  };

  const filteredSections = authLoading && !userRole
    ? sections.map((s) => ({ ...s, items: s.items.slice(0, 1) })).slice(0, 2)
    : sections
        .map((section) => ({
          ...section,
          items: section.items
            .map(processItem)
            .filter((i): i is NavItem & { locked?: boolean } => i !== null),
        }))
        .filter((section) => section.items.length > 0);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    // Open section (and parent item) that contains the active route, incluyendo hijos
    // anidados (ej: entrar directo a /dashboard/recepcion abre Agenda Y Calendario).
    const active = filteredSections.find((s) =>
      s.items.some((i) => i.href === pathname || i.children?.some((c) => c.href === pathname))
    );
    if (active) {
      setOpenSections((prev) => ({ ...prev, [active.title]: true }));
      const parentItem = active.items.find((i) => i.children?.some((c) => c.href === pathname));
      if (parentItem) setOpenItems((prev) => ({ ...prev, [parentItem.href]: true }));
    }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleItem = (href: string) => {
    setOpenItems((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  const handleLogout = async () => {
    // Clear the super_admin "viewing as another business" override, otherwise it stays
    // in localStorage and the NEXT person to log in on this browser keeps seeing that
    // other business's data (real leak: an Estudio Levels admin saw Saray Business
    // clients and services because of a leftover override).
    try { localStorage.removeItem("tenant_override"); } catch {}
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrador",
    barber: "Profesional",
    receptionist: "Recepcionista",
  };

  const renderNav = (showLabels: boolean) => (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {filteredSections.map((section) => {
        const isOpen = openSections[section.title] !== false;
        const hasActive = section.items.some((i) => i.href === pathname);

        return (
          <div key={section.title} className="mb-2">
            {showLabels && (
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-brand-gray font-semibold"
              >
                <span>{section.title}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform text-brand-gray", !isOpen && "-rotate-90")} />
              </button>
            )}

            {(isOpen || !showLabels) && (
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isLocked = (item as any).locked;
                  const hasChildren = !!item.children && item.children.length > 0;
                  const childActive = item.children?.some((c) => c.href === pathname) ?? false;
                  // Punto (Nico, 25-sep): si el usuario nunca lo toco, se auto-abre cuando
                  // contiene la ruta activa (se recalcula en cada render, no necesita el
                  // useEffect de montaje para el caso de navegar entre paginas ya adentro).
                  const itemOpen = openItems[item.href] ?? childActive;
                  return (
                    <li key={item.href}>
                      <div className="flex items-center">
                        {isLocked ? (
                          <div
                            title="Disponible en plan superior"
                            className={cn(
                              "flex flex-1 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium opacity-40 cursor-not-allowed",
                              !showLabels && "justify-center px-2",
                            )}
                          >
                            <item.icon className="h-[18px] w-[18px] flex-shrink-0 text-brand-gray" strokeWidth={1.5} />
                            {showLabels && (
                              <span className="truncate flex-1">{item.name}</span>
                            )}
                            {showLabels && (
                              <span className="px-1.5 py-0.5 bg-brand-accent/20 text-brand-accent text-[9px] font-bold rounded">PRO</span>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            title={!showLabels ? item.name : undefined}
                            className={cn(
                              "flex flex-1 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                              !showLabels && "justify-center px-2",
                              isActive
                                ? "bg-brand-blue/10 text-brand-blue"
                                : "text-brand-dark/70 hover:bg-brand-light hover:text-brand-dark"
                            )}
                          >
                            <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive ? "text-brand-blue" : "text-brand-gray")} strokeWidth={1.5} />
                            {showLabels && <span className="truncate">{item.name}</span>}
                          </Link>
                        )}
                        {hasChildren && showLabels && !isLocked && (
                          <button
                            onClick={() => toggleItem(item.href)}
                            title={itemOpen ? "Colapsar" : "Expandir"}
                            className="flex-shrink-0 p-1.5 mr-1 text-brand-gray hover:text-brand-dark"
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !itemOpen && "-rotate-90")} />
                          </button>
                        )}
                      </div>

                      {hasChildren && showLabels && itemOpen && (
                        <ul className="mt-0.5 ml-4 pl-3 border-l border-gray-100 dark:border-white/10 space-y-0.5">
                          {item.children!.map((child) => {
                            const childLocked = (child as any).locked;
                            const childIsActive = pathname === child.href;
                            return (
                              <li key={child.href}>
                                {childLocked ? (
                                  <div
                                    title="Disponible en plan superior"
                                    className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium opacity-40 cursor-not-allowed"
                                  >
                                    <child.icon className="h-4 w-4 flex-shrink-0 text-brand-gray" strokeWidth={1.5} />
                                    <span className="truncate flex-1">{child.name}</span>
                                    <span className="px-1.5 py-0.5 bg-brand-accent/20 text-brand-accent text-[9px] font-bold rounded">PRO</span>
                                  </div>
                                ) : (
                                  <Link
                                    href={child.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                                      childIsActive
                                        ? "bg-brand-blue/10 text-brand-blue"
                                        : "text-brand-dark/60 hover:bg-brand-light hover:text-brand-dark"
                                    )}
                                  >
                                    <child.icon className={cn("h-4 w-4 flex-shrink-0", childIsActive ? "text-brand-blue" : "text-brand-gray")} strokeWidth={1.5} />
                                    <span className="truncate">{child.name}</span>
                                  </Link>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-brand-white border-b border-gray-100 dark:border-white/10 flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(true)} className="text-brand-dark p-1"><Menu className="h-6 w-6" /></button>
        <Link href="/dashboard">
          <img src="/logo-horizontal.png" alt="re-booking" className="h-7 w-auto dark:hidden" />
          <img src="/logo-horizontal-white.png" alt="re-booking" className="h-7 w-auto hidden dark:block" />
        </Link>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}

      {/* Mobile drawer */}
      <div className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-brand-white flex flex-col transform transition-transform duration-200 shadow-xl",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-14 items-center justify-between px-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <img src="/logo-horizontal.png" alt="re-booking" className="h-8 w-auto dark:hidden" />
              <img src="/logo-horizontal-white.png" alt="re-booking" className="h-8 w-auto hidden dark:block" />
            </Link>
            {effectiveTenantName && <span className="text-xs text-brand-gray font-medium truncate max-w-[120px]">· {effectiveTenantName}</span>}
          </div>
          <button onClick={() => setMobileOpen(false)} className="text-brand-gray hover:text-brand-dark"><X className="h-5 w-5" /></button>
        </div>
        {renderNav(true)}
        <div className="border-t border-gray-100 dark:border-white/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-dark truncate">{userName}</p>
              <p className="text-xs text-brand-gray">{roleLabel[userRole] || userRole}</p>
            </div>
            <button onClick={handleLogout} className="text-brand-gray hover:text-red-500 p-2"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={cn(
        "hidden lg:flex h-full flex-col bg-white dark:bg-brand-white border-r border-gray-100 dark:border-white/10 flex-shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}>
        <div className={cn("flex h-14 items-center border-b border-gray-100 dark:border-white/10", collapsed ? "justify-center" : "justify-between px-4")}>
          {!collapsed && (
            <Link href="/dashboard">
              <img src="/logo-horizontal.png" alt="re-booking" className="h-7 w-auto dark:hidden" />
              <img src="/logo-horizontal-white.png" alt="re-booking" className="h-7 w-auto hidden dark:block" />
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard">
              <img src="/logo-icon.png" alt="re-booking" className="h-8 w-8 dark:hidden" />
              <img src="/logo-icon-white.png" alt="re-booking" className="h-8 w-8 hidden dark:block" />
            </Link>
          )}
          <button onClick={toggleCollapse} className="text-brand-gray hover:text-brand-dark p-1 rounded-lg hover:bg-brand-light">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Tenant name */}
        {!collapsed && effectiveTenantName && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs font-semibold text-brand-dark truncate">{effectiveTenantName}</p>
          </div>
        )}

        {/* Search hint */}
        {!collapsed && (
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-light hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-brand-gray"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs flex-1 text-left">Buscar...</span>
            <kbd className="text-[9px] bg-white dark:bg-brand-light border border-gray-200 dark:border-white/10 px-1.5 py-0.5 rounded font-mono text-brand-gray">⌘K</kbd>
          </button>
        )}
        {renderNav(!collapsed)}
        <div className="border-t border-gray-100 dark:border-white/10 p-3">
          {collapsed ? (
            <button onClick={handleLogout} className="w-full flex justify-center text-brand-gray hover:text-red-500 p-2" title="Cerrar sesion">
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2">
              {userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-blue/10 flex items-center justify-center text-[10px] font-bold text-brand-blue flex-shrink-0">
                  {userName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-brand-dark truncate">{userName}</p>
                <p className="text-[10px] text-brand-gray">{roleLabel[userRole] || userRole}</p>
              </div>
              <button onClick={handleLogout} className="text-brand-gray hover:text-red-500 p-1"><LogOut className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
