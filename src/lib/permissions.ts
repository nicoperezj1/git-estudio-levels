// Role-based access control configuration
export type Role = "super_admin" | "admin" | "barber" | "client" | "receptionist";

export interface Permission {
  routes: string[]; // Allowed dashboard routes (prefix match)
  features: string[]; // Feature flags
}

// Routes each role can access (prefix match against pathname)
export const ROLE_PERMISSIONS: Record<Role, Permission> = {
  super_admin: {
    routes: [
      "/dashboard", // everything
    ],
    features: [
      "pos", "calendar_all", "calendar_own", "clients_all", "clients_own",
      "professionals_manage", "professionals_view", "commissions_all", "commissions_own",
      "rental", "reports", "inventory", "coupons", "boletas", "reviews",
      "loyalty", "gallery", "waitlist", "retention", "mercadopago_config",
      "mercadopago_view", "configuration", "branches", "roles_manage",
      "delete_data", "standby", "cash_register", "prices",
    ],
  },
  admin: {
    routes: [
      "/dashboard",
      "/dashboard/pos",
      "/dashboard/calendario",
      "/dashboard/clientes",
      "/dashboard/barberos",
      "/dashboard/comisiones",
      "/dashboard/arriendo",
      "/dashboard/reportes",
      "/dashboard/inventario",
      "/dashboard/cupones",
      "/dashboard/boletas",
      "/dashboard/finanzas",
      "/dashboard/reviews",
      "/dashboard/fidelizacion",
      "/dashboard/galeria",
      "/dashboard/waitlist",
      "/dashboard/retencion",
      "/dashboard/terminal-pos",
      "/dashboard/standby",
      "/dashboard/caja",
      "/dashboard/reservas",
    ],
    features: [
      "pos", "calendar_all", "clients_all", "professionals_view",
      "commissions_all", "rental", "reports", "inventory", "coupons",
      "boletas", "reviews", "loyalty", "gallery", "waitlist", "retention",
      "mercadopago_view", "standby", "cash_register",
    ],
  },
  barber: {
    // A professional must NOT have the "/dashboard" wildcard: it granted access to the
    // whole dashboard (global reports, finances, other professionals' income). They
    // only get their own screens, listed explicitly. Their landing page is their own
    // agenda, not the business-wide dashboard home.
    routes: [
      "/dashboard/mi-agenda",
      "/dashboard/calendario",
      "/dashboard/standby",
      "/dashboard/comisiones",
      "/dashboard/clientes",
      "/dashboard/mi-billetera",
      "/dashboard/mi-perfil",
    ],
    features: [
      "calendar_own", "clients_own", "commissions_own", "standby",
    ],
  },
  client: {
    routes: [
      "/booking",
      "/portal",
    ],
    features: [
      "booking", "portal_own",
    ],
  },
  receptionist: {
    routes: [
      "/dashboard",
      "/dashboard/pos",
      "/dashboard/calendario",
      "/dashboard/clientes",
      "/dashboard/recepcion",
      "/dashboard/agenda",
      "/dashboard/standby",
      "/dashboard/caja",
      "/dashboard/barberos",
      "/dashboard/inventario",
      "/dashboard/solicitud",
    ],
    features: [
      "pos", "calendar_all", "clients_all", "standby", "reception",
      "cash_register",
      // Limited variants for a receptionist: they can open Profesionales but only to
      // edit work schedules (everything else on that screen is hidden), and Inventario
      // is read-only unless they enter the admin PIN to change something.
      "professionals_schedule_only",
      "inventory_view_locked",
    ],
  },
};

// Check if a role can access a route
export function canAccessRoute(role: Role, pathname: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;

  return perms.routes.some((route) => {
    // "/dashboard" as a listed route means access to ALL dashboard routes for that role,
    // EXCEPT the platform-owner area (/dashboard/superadmin: empresas, auditoria, sesiones),
    // which only the super_admin may open. Before, admin and reception could reach it by URL.
    if (route === "/dashboard") {
      if (pathname.startsWith("/dashboard/superadmin")) return role === "super_admin";
      return pathname.startsWith("/dashboard");
    }
    return pathname === route || pathname.startsWith(route + "/");
  });
}

// Check if a role has a feature
export function hasFeature(role: Role, feature: string): boolean {
  return ROLE_PERMISSIONS[role]?.features.includes(feature) || false;
}

// Sidebar items config with required role
export interface SidebarItem {
  name: string;
  href: string;
  icon: string;
  minRole: Role; // minimum role needed
}
