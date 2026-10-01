"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { setTenantId as setGlobalTenantId } from "@/lib/api-fetch";


interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  max_professionals: number;
  max_branches: number;
  trial_ends_at: string | null;
  // Punto (Nico, 25-sep): tema claro/oscuro elegido por el Administrador en
  // Configuracion, aplicado a todo el sistema para ese negocio.
  theme: "light" | "dark";
  // Item 37 (Nico, 27-sep): wizard de bienvenida para negocios nuevos. Ver
  // src/app/dashboard/onboarding/page.tsx y supabase/migrations/077_onboarding.sql.
  onboarding_completed: boolean;
  onboarding_step: number;
}

interface TenantContextType {
  tenant: TenantInfo | null;
  // Tema propio del usuario (null = usa el del negocio). Ver api/profile/theme.
  userTheme: "light" | "dark" | null;
  setUserTheme: (theme: "light" | "dark" | null) => void;
  loading: boolean;
  isTrialExpired: boolean;
  daysLeft: number;
  hasPlanFeature: (feature: string) => boolean;
  // Switch tenant (super_admin feature)
  isOverriding: boolean;
  switchTenant: (tenantId: string, tenantName: string) => void;
  exitTenant: () => void;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  userTheme: null,
  setUserTheme: () => {},
  loading: true,
  isTrialExpired: false,
  daysLeft: 0,
  hasPlanFeature: () => true,
  isOverriding: false,
  switchTenant: () => {},
  exitTenant: () => {},
});

export function TenantProvider({ children, serverTenantId }: { children: ReactNode; serverTenantId?: string | null }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [userTheme, setUserTheme] = useState<"light" | "dark" | null>(null);
  const [planFeatures, setPlanFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { effectiveRole } = useAuth();

  // Only a super_admin may view the app "as" another business. The override lives in
  // localStorage, which survives logout — so if a super_admin switched to business A
  // and later someone logged into a regular admin account in the SAME browser, that
  // stale override kept pointing the whole app at business A. That's exactly how an
  // Estudio Levels admin ended up seeing Saray Business clients and services.
  // Now the override is ignored (and cleaned up) for anyone who isn't super_admin.
  const isSuperAdmin = effectiveRole === "super_admin";

  // Read override from localStorage synchronously on init
  const getInitialOverride = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.tenantId || null;
      }
    } catch {}
    return null;
  };

  const [overrideTenantId, setOverrideTenantId] = useState<string | null>(getInitialOverride);
  const [isOverriding, setIsOverriding] = useState(!!getInitialOverride());

  // Drop any override left behind by a previous (super_admin) session in this browser.
  useEffect(() => {
    if (!effectiveRole || isSuperAdmin) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("tenant_override")) {
      localStorage.removeItem("tenant_override");
      setOverrideTenantId(null);
      setIsOverriding(false);
    }
  }, [effectiveRole, isSuperAdmin]);

  // Determine which tenant to load: override (super_admin only) > server-provided
  const activeTenantId = (isSuperAdmin ? overrideTenantId : null) || serverTenantId;

  useEffect(() => {
    if (!activeTenantId) {
      // No tenant (super admin without override)
      setTenant(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/tenant/info?tenantId=${activeTenantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tenant) {
          setTenant(data.tenant);
          setPlanFeatures(data.features || []);
          setUserTheme(data.userTheme === "light" || data.userTheme === "dark" ? data.userTheme : null);
          setGlobalTenantId(data.tenant.id);
        } else {
          setTenant(null);
        }
      })
      // Si la respuesta viene vacia o falla la red, no dejar un error sin manejar.
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }, [activeTenantId]);

  // Punto (Nico, 25-sep): aplica el tema claro/oscuro del negocio a TODO el sistema
  // (html.dark, ver globals.css/tailwind.config.ts) apenas se conoce el tenant. Se
  // limpia al desmontar (ej. al salir a /login, donde no hay TenantProvider) para que
  // esa pantalla no se quede oscura por un tema que ya no aplica.
  useEffect(() => {
    if (typeof document === "undefined") return;
    // El tema del usuario manda; si no eligio uno, aplica el del negocio.
    const effective = userTheme ?? tenant?.theme;
    document.documentElement.classList.toggle("dark", effective === "dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [userTheme, tenant?.theme]);

  const switchTenant = (tenantId: string, tenantName: string) => {
    localStorage.setItem("tenant_override", JSON.stringify({ tenantId, tenantName }));
    setOverrideTenantId(tenantId);
    setIsOverriding(true);
    // Bug (reportado por Nico, 25-sep): antes esto solo hacia reload() de la pagina
    // actual. Si el click en "Entrar" se hacia desde /dashboard/superadmin/tenants (el
    // unico lugar desde donde se puede entrar), el reload volvia a caer en esa misma
    // lista de empresas — que no depende del tenant activo — asi que visualmente parecia
    // que el boton "no hacia nada", aunque el override si quedaba guardado. Ahora se
    // navega directo al dashboard del negocio para que el cambio se vea de inmediato.
    window.location.href = "/dashboard";
  };

  const exitTenant = () => {
    localStorage.removeItem("tenant_override");
    setOverrideTenantId(null);
    setIsOverriding(false);
    setTenant(null);
    setGlobalTenantId(null);
    window.location.reload();
  };

  const daysLeft = tenant?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const isTrialExpired = tenant?.status === "trial" && daysLeft <= 0;

  const hasPlanFeature = (feature: string): boolean => {
    if (!tenant) return true; // No tenant = super admin = all features
    return planFeatures.includes(feature);
  };

  return (
    <TenantContext.Provider value={{ tenant, userTheme, setUserTheme, loading, isTrialExpired, daysLeft, hasPlanFeature, isOverriding: isOverriding && isSuperAdmin, switchTenant, exitTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
