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
  MessageCircle, Clock, FileText, UserCircle, PiggyBank, ClipboardList,
  Building2, ShieldCheck, Ticket, Percent, KeyRound, Truck, Briefcase, Plane,
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
  // Item 34 (Nico, 26-sep): "matriz de accesos por plan" — un modulo cuyo acceso depende
  // del plan contratado (no del rol). Cuando el plan del negocio no incluye esta feature,
  // el item se muestra bloqueado con la misma insignia "PRO" que ya existia para roles.
  feature?: string;
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
      { name: "Mi Agenda", href: "/dashboard/mi-agenda", icon: CalendarCheck, minRole: "barber" },
      { name: "Standby", href: "/dashboard/standby", icon: Zap, minRole: "barber" },
    ],
  },
  {
    // Nico (29-sep): el trabajo del dia a dia junto — agenda, venta y caja.
    title: "Operación",
    items: [
      {
        name: "Calendario", href: "/dashboard/calendario", icon: CalendarDays, minRole: "receptionist",
        // Recepcion, Recordatorios y Lista de espera son hijos de Calendario.
        children: [
          { name: "Recepción", href: "/dashboard/recepcion", icon: Tablet, minRole: "receptionist" },
          { name: "Recordatorios", href: "/dashboard/recordatorios", icon: Bell, minRole: "admin" },
          { name: "Lista de espera", href: "/dashboard/waitlist", icon: Clock, minRole: "admin" },
        ],
      },
      { name: "Agenda", href: "/dashboard/agenda", icon: Calendar, minRole: "receptionist" },
      { name: "Punto de Venta", href: "/dashboard/pos", icon: ShoppingCart, minRole: "receptionist" },
      { name: "Solicitud de insumos", href: "/dashboard/solicitud", icon: ClipboardList, minRole: "receptionist", feature: "inventory" },
      { name: "Caja", href: "/dashboard/caja", icon: Wallet, minRole: "admin", feature: "cash_register" },
    ],
  },
  {
    // Clientes y todo lo que sirve para relacionarse con ellos (mensajes, cupones).
    title: "Clientes",
    items: [
      {
        name: "Clientes", href: "/dashboard/clientes", icon: Users, minRole: "receptionist",
        // Metricas, Fidelidad y Retencion anidadas bajo Clientes.
        children: [
          { name: "Métricas", href: "/dashboard/clientes/metricas", icon: BarChart3, minRole: "receptionist" },
          { name: "Fidelidad", href: "/dashboard/fidelidad", icon: Star, minRole: "admin", feature: "loyalty" },
          { name: "Retención", href: "/dashboard/retencion", icon: Heart, minRole: "admin" },
        ],
      },
      { name: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, minRole: "admin" },
      { name: "Cupones", href: "/dashboard/cupones", icon: Ticket, minRole: "admin", feature: "coupons" },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { name: "Ingresos/Egresos", href: "/dashboard/finanzas", icon: DollarSign, minRole: "admin" },
      { name: "Boletas", href: "/dashboard/boletas", icon: Receipt, minRole: "admin" },
      { name: "Facturas", href: "/dashboard/facturas", icon: FileText, minRole: "admin", feature: "invoices" },
      { name: "Cierre Mensual", href: "/dashboard/reportes", icon: ClipboardList, minRole: "admin" },
      { name: "Mi Billetera", href: "/dashboard/mi-billetera", icon: PiggyBank, minRole: "barber" },
    ],
  },
  {
    // Equipo, sucursales, configuracion y la cuenta personal.
    title: "Negocio",
    items: [
      { name: "Profesionales", href: "/dashboard/barberos", icon: Scissors, minRole: "admin" },
      { name: "Sucursales", href: "/dashboard/sucursales", icon: MapPin, minRole: "admin" },
      {
        name: "Mi negocio", href: "/dashboard/mi-negocio", icon: Briefcase, minRole: "admin",
        // Fase 6: lo que se administra del negocio, junto en un solo menu.
        children: [
          { name: "Vacaciones", href: "/dashboard/vacaciones", icon: Plane, minRole: "admin" },
          { name: "Comisiones", href: "/dashboard/comisiones", icon: Percent, minRole: "barber", feature: "commissions" },
          { name: "Arriendo", href: "/dashboard/arriendo", icon: KeyRound, minRole: "admin", feature: "rental" },
          { name: "Servicios", href: "/dashboard/servicios", icon: Tag, minRole: "admin" },
          { name: "Proveedores", href: "/dashboard/proveedores", icon: Truck, minRole: "admin" },
          { name: "Remuneraciones", href: "/dashboard/remuneraciones", icon: FileText, minRole: "super_admin" }, // oculto a los negocios hasta terminar las pruebas
        ],
      },
      { name: "Precios", href: "/dashboard/precios", icon: Tag, minRole: "super_admin" },
      { name: "Galería", href: "/dashboard/galeria", icon: Image, minRole: "admin" },
      { name: "Pagos", href: "/dashboard/pagos", icon: CreditCard, minRole: "admin" },
      {
        name: "Configuración", href: "/dashboard/configuracion", icon: Settings, minRole: "admin",
        // Terminal POS e Inventario son hijos de Configuracion (Comisiones, Arriendo, Servicios y Proveedores ahora viven en Mi negocio).
        children: [
          { name: "Terminal POS", href: "/dashboard/terminal-pos", icon: CreditCard, minRole: "admin", feature: "pos" },
          { name: "Inventario", href: "/dashboard/inventario", icon: Package, minRole: "admin", feature: "inventory" },
          { name: "Plan y facturación", href: "/dashboard/configuracion/facturacion", icon: CreditCard, minRole: "admin" },
        ],
      },
      { name: "Mi Perfil", href: "/dashboard/mi-perfil", icon: UserCircle, minRole: "barber" },
    ],
  },
  {
    title: "Super Admin",
    items: [
      { name: "Empresas", href: "/dashboard/superadmin/tenants", icon: Building2, minRole: "super_admin" },
      { name: "Auditoría", href: "/dashboard/superadmin/audit", icon: ShieldCheck, minRole: "super_admin" },
      { name: "Sesiones", href: "/dashboard/superadmin/sesiones", icon: Tablet, minRole: "super_admin" },
      { name: "Horarios", href: "/dashboard/configuracion/horarios", icon: Clock, minRole: "super_admin" },
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
  const { tenant: overrideTenant, isOverriding, hasPlanFeature } = useTenant();
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
      "/dashboard/caja", "/dashboard/barberos", "/dashboard/inventario", "/dashboard/solicitud",
      // Cada usuario (tambien recepcion) puede entrar a Mi Perfil a elegir su propio tema.
      "/dashboard/mi-perfil",
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

    // Seguridad/UX (Nico, 26-sep): "Super Admin" es un rol, no algo que se desbloquee
    // pagando un plan — antes, un admin/recepcion/profesional que no fuera super_admin
    // veia estos items igual, marcados con la insignia "PRO" (pensada para funciones que
    // SI se pueden desbloquear con otro plan). Eso confundia: parecia que "actualizando"
    // el plan del negocio se podia llegar a Empresas/Auditoria/Sesiones/Horarios, cuando
    // en realidad ningun plan da ese acceso. Ahora se ocultan por completo para cualquiera
    // que no sea super_admin, en vez de mostrarse bloqueados.
    if (item.minRole === "super_admin" && effectiveRole !== "super_admin") return null;

    const whitelist = ROLE_MENU_ACCESS[effectiveRole];
    const roleLocked = whitelist ? !whitelist.includes(item.href) : !isAtLeast(item.minRole);

    // Item 34 (Nico, 26-sep): "matriz de accesos por plan" — ademas del rol, un item puede
    // requerir una feature que el plan del negocio no incluya (ej. Caja en Basic/Starter).
    // super_admin sin tenant activo (hasPlanFeature devuelve true sin tenant) ve todo.
    const planLocked = !!item.feature && !hasPlanFeature(item.feature);
    const locked = roleLocked || planLocked;

    // Para roles con whitelist explicita (receptionist/barber): un item bloqueado POR ROL
    // se saca por completo en vez de mostrarse como "PRO" — mismo comportamiento de antes,
    // ahora recursivo para que tambien aplique a los hijos. Uno bloqueado solo por el plan
    // SI se muestra (con la insignia), para que reception/barber tambien vean que existe
    // ese modulo y que hace falta mejorar el plan para usarlo.
    if (whitelist && roleLocked) return null;

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
    <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
      {filteredSections.map((section, sIdx) => {
        const isOpen = openSections[section.title] !== false;

        return (
          <div key={section.title} className={cn(showLabels ? "mb-5" : "mb-3", !showLabels && sIdx > 0 && "border-t border-black/5 pt-3 dark:border-white/5")}>
            {showLabels && (
              <button
                onClick={() => toggleSection(section.title)}
                className="group/label mb-1 flex w-full items-center justify-between px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-gray/70 transition-colors hover:text-brand-gray"
              >
                <span>{section.title}</span>
                <ChevronDown className={cn("h-3 w-3 opacity-0 transition-all group-hover/label:opacity-100", !isOpen && "-rotate-90 opacity-100")} />
              </button>
            )}

            {(isOpen || !showLabels) && (
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isLocked = (item as any).locked;
                  const hasChildren = !!item.children && item.children.length > 0;
                  const childActive = item.children?.some((c) => c.href === pathname) ?? false;
                  // Se auto-abre cuando contiene la ruta activa.
                  const itemOpen = openItems[item.href] ?? childActive;
                  const rowBase = "relative flex flex-1 min-w-0 items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] transition-colors";
                  return (
                    <li key={item.href}>
                      <div className="flex items-center">
                        {isLocked ? (
                          <div
                            title="Disponible en plan superior"
                            className={cn(rowBase, "cursor-not-allowed text-brand-gray/60", !showLabels && "justify-center px-2")}
                          >
                            <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                            {showLabels && <span className="flex-1 truncate">{item.name}</span>}
                            {showLabels && (
                              <span className="rounded border border-brand-gray/30 px-1 py-px text-[9px] font-medium tracking-wide text-brand-gray/70">PRO</span>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            title={!showLabels ? item.name : undefined}
                            className={cn(
                              rowBase,
                              !showLabels && "justify-center px-2",
                              isActive
                                ? "bg-brand-dark/[0.06] font-semibold text-brand-dark"
                                : "font-medium text-brand-dark/65 hover:bg-brand-dark/[0.04] hover:text-brand-dark"
                            )}
                          >
                            {isActive && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-blue" />}
                            <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-brand-blue" : "text-brand-gray")} strokeWidth={1.6} />
                            {showLabels && <span className="truncate">{item.name}</span>}
                          </Link>
                        )}
                        {hasChildren && showLabels && !isLocked && (
                          <button
                            onClick={() => toggleItem(item.href)}
                            title={itemOpen ? "Colapsar" : "Expandir"}
                            className="mr-1 flex-shrink-0 rounded p-1.5 text-brand-gray/70 transition-colors hover:text-brand-dark"
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !itemOpen && "-rotate-90")} />
                          </button>
                        )}
                      </div>

                      {hasChildren && showLabels && itemOpen && (
                        <ul className="mb-1 ml-[21px] mt-px space-y-px border-l border-black/10 pl-3 dark:border-white/10">
                          {item.children!.map((child) => {
                            const childLocked = (child as any).locked;
                            const childIsActive = pathname === child.href;
                            return (
                              <li key={child.href}>
                                {childLocked ? (
                                  <div
                                    title="Disponible en plan superior"
                                    className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] text-brand-gray/60"
                                  >
                                    <span className="flex-1 truncate">{child.name}</span>
                                    <span className="rounded border border-brand-gray/30 px-1 py-px text-[9px] font-medium tracking-wide text-brand-gray/70">PRO</span>
                                  </div>
                                ) : (
                                  <Link
                                    href={child.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                      "flex items-center rounded-md px-3 py-1.5 text-[12.5px] transition-colors",
                                      childIsActive
                                        ? "font-semibold text-brand-blue"
                                        : "font-medium text-brand-dark/55 hover:text-brand-dark"
                                    )}
                                  >
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
            <p className="truncate text-[13px] font-semibold tracking-tight text-brand-dark">{effectiveTenantName}</p>
          </div>
        )}

        {/* Search hint */}
        {!collapsed && (
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-black/10 px-3 py-1.5 text-brand-gray transition-colors hover:border-black/20 hover:text-brand-dark dark:border-white/10 dark:hover:border-white/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs flex-1 text-left">Buscar...</span>
            <kbd className="text-[9px] border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded font-mono text-brand-gray">⌘K</kbd>
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
