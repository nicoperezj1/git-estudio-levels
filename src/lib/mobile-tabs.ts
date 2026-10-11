// Barra inferior del celular personalizable: catalogo de atajos posibles y reglas de quien puede ver cada uno.
// Cada usuario elige hasta 4 (el 5.º siempre es "Más"); el administrador fija los del negocio por rol.
// Solo aparece lo que el rol y el plan del negocio permiten (las mismas reglas del menu lateral).
import type { Role } from "@/lib/permissions";

export const MAX_TABS = 4;
export type TabRole = "admin" | "receptionist" | "barber";

export interface TabDef {
  key: string;
  label: string;
  href: string;
  icon: string;        // nombre del icono (ver components/layout/tab-icons.ts)
  minRole: Role;
  feature?: string;    // modulo que depende del plan
  basicLocked?: boolean; // no disponible en el plan Basic
}

export const TAB_CATALOG: TabDef[] = [
  { key: "inicio", label: "Inicio", href: "/dashboard", icon: "home", minRole: "admin" },
  { key: "mi-agenda", label: "Mi agenda", href: "/dashboard/mi-agenda", icon: "calendar-check", minRole: "barber" },
  { key: "calendario", label: "Calendario", href: "/dashboard/calendario", icon: "calendar", minRole: "receptionist" },
  { key: "standby", label: "Standby", href: "/dashboard/standby", icon: "zap", minRole: "barber", basicLocked: true },
  { key: "pos", label: "Venta", href: "/dashboard/pos", icon: "cart", minRole: "receptionist", basicLocked: true },
  { key: "caja", label: "Caja", href: "/dashboard/caja", icon: "wallet", minRole: "receptionist", feature: "cash_register" },
  { key: "clientes", label: "Clientes", href: "/dashboard/clientes", icon: "users", minRole: "receptionist" },
  { key: "whatsapp", label: "WhatsApp", href: "/dashboard/whatsapp", icon: "message", minRole: "admin" },
  { key: "cupones", label: "Cupones", href: "/dashboard/cupones", icon: "ticket", minRole: "admin", feature: "coupons" },
  { key: "finanzas", label: "Egresos", href: "/dashboard/finanzas", icon: "dollar", minRole: "admin", basicLocked: true },
  { key: "boletas", label: "Boletas", href: "/dashboard/boletas", icon: "receipt", minRole: "admin", basicLocked: true },
  { key: "cierre", label: "Cierre", href: "/dashboard/reportes", icon: "clipboard", minRole: "admin" },
  { key: "mi-billetera", label: "Billetera", href: "/dashboard/mi-billetera", icon: "piggy", minRole: "barber", basicLocked: true },
  { key: "comisiones", label: "Comisiones", href: "/dashboard/comisiones", icon: "percent", minRole: "barber", feature: "commissions", basicLocked: true },
  { key: "arriendo", label: "Arriendo", href: "/dashboard/arriendo", icon: "key", minRole: "admin", feature: "rental", basicLocked: true },
  { key: "profesionales", label: "Equipo", href: "/dashboard/barberos", icon: "scissors", minRole: "admin" },
  { key: "servicios", label: "Servicios", href: "/dashboard/servicios", icon: "tag", minRole: "admin" },
  { key: "inventario", label: "Inventario", href: "/dashboard/inventario", icon: "package", minRole: "admin", feature: "inventory" },
  { key: "solicitud", label: "Insumos", href: "/dashboard/solicitud", icon: "clipboard", minRole: "receptionist", feature: "inventory" },
  { key: "soporte", label: "Ayuda", href: "/dashboard/soporte", icon: "lifebuoy", minRole: "barber" },
  { key: "mi-perfil", label: "Perfil", href: "/dashboard/mi-perfil", icon: "user", minRole: "barber" },
];

export const DEFAULT_TABS: Record<TabRole, string[]> = {
  admin: ["inicio", "calendario", "pos", "clientes"],
  receptionist: ["calendario", "pos", "clientes", "caja"],
  barber: ["mi-agenda", "calendario", "clientes", "mi-billetera"],
};

// Lo que cada rol con lista explicita puede abrir (igual que el menu lateral).
export const ROLE_MENU_ACCESS: Record<string, string[]> = {
  receptionist: [
    "/dashboard/pos", "/dashboard/clientes", "/dashboard/calendario",
    "/dashboard/agenda", "/dashboard/recepcion", "/dashboard/standby",
    "/dashboard/fidelidad", "/dashboard/retencion", "/dashboard/whatsapp",
    "/dashboard/boletas", "/dashboard/cupones", "/dashboard/configuracion",
    "/dashboard/caja", "/dashboard/barberos", "/dashboard/inventario", "/dashboard/solicitud",
    "/dashboard/mi-perfil", "/dashboard/avisos", "/dashboard/soporte",
  ],
  barber: [
    "/dashboard/standby", "/dashboard/mi-agenda", "/dashboard/calendario",
    "/dashboard/clientes", "/dashboard/mi-billetera",
    "/dashboard/mi-perfil", "/dashboard/avisos", "/dashboard/soporte",
  ],
};

const RANK: Record<string, number> = { client: 0, barber: 1, receptionist: 2, admin: 3, super_admin: 4 };

export const toTabRole = (role: string | null | undefined): TabRole =>
  role === "receptionist" ? "receptionist" : role === "barber" ? "barber" : "admin";

/** ¿El rol puede abrir esa pantalla? (sin mirar el plan) */
export function roleCanSee(def: TabDef, role: string | null | undefined): boolean {
  const r = toTabRole(role);
  const whitelist = ROLE_MENU_ACCESS[r];
  if (whitelist) return whitelist.includes(def.href);
  return RANK.admin >= RANK[def.minRole];
}

/** ¿Esta disponible para ese rol y plan? */
export function tabAvailable(
  def: TabDef,
  role: string | null | undefined,
  plan: { hasPlanFeature: (f: string) => boolean; plan?: string | null }
): boolean {
  if (!roleCanSee(def, role)) return false;
  if (def.feature && !plan.hasPlanFeature(def.feature)) return false;
  if (def.basicLocked && plan.plan === "basic") return false;
  return true;
}

/** Sanea una lista de claves guardada: solo claves conocidas, sin repetidas, maximo 4. */
export function cleanKeys(keys: unknown): string[] | null {
  if (!Array.isArray(keys)) return null;
  const known = new Set(TAB_CATALOG.map((t) => t.key));
  const out: string[] = [];
  for (const k of keys) if (typeof k === "string" && known.has(k) && !out.includes(k)) out.push(k);
  return out.slice(0, MAX_TABS);
}

export interface TabPrefs { mine: string[] | null; tenant: Partial<Record<TabRole, string[]>> | null }

/** Los atajos que se muestran: los del usuario, o los del negocio para su rol, o los de siempre. */
export function resolveTabs(
  role: string | null | undefined,
  prefs: TabPrefs | null,
  plan: { hasPlanFeature: (f: string) => boolean; plan?: string | null }
): TabDef[] {
  const r = toTabRole(role);
  const byKey = new Map(TAB_CATALOG.map((t) => [t.key, t]));
  const pick = (keys: string[] | null | undefined) =>
    (keys || []).map((k) => byKey.get(k)).filter((t): t is TabDef => !!t && tabAvailable(t, role, plan)).slice(0, MAX_TABS);
  const own = pick(prefs?.mine);
  if (own.length > 0) return own;
  const biz = pick(prefs?.tenant?.[r]);
  if (biz.length > 0) return biz;
  return pick(DEFAULT_TABS[r]);
}
