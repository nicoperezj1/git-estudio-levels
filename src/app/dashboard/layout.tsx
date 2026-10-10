import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { ToastWrapper } from "@/components/providers/toast-wrapper";
import { AuthWrapper } from "@/components/providers/auth-wrapper";
import { SuspendedGate } from "@/components/layout/suspended-gate";
import { TrialBanner } from "@/components/layout/trial-banner";
import { TenantOverrideBanner } from "@/components/layout/tenant-override-banner";
import { PushNotificationPrompt } from "@/components/push-notifications";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette } from "@/components/command-palette";
import { QuickActions } from "@/components/quick-actions";
import { AppLock } from "@/components/app-lock";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Single query: profile + tenant name via join (was two sequential round-trips).
  const { data: profile } = await createAdminSupabase()
    .from("profiles")
    .select("name, role, tenant_id, tenant:tenants(name, status, admin_email, must_change_password, temp_password, created_at)")
    .eq("id", user.id)
    .single();

  // Primer ingreso de un negocio nuevo: obliga a crear una clave propia (dos veces) antes de
  // entrar. Solo aplica al administrador del negocio, mientras la clave temporal siga vigente,
  // y a negocios creados desde el 10-oct-2026 para no pedirsela de golpe a los que ya operan.
  const t = profile?.tenant as any;
  if (
    profile?.role === "admin" &&
    t?.must_change_password === true &&
    t?.temp_password &&
    t?.admin_email?.toLowerCase() === user.email?.toLowerCase() &&
    new Date(t.created_at) >= new Date("2026-10-10T00:00:00-03:00")
  ) {
    redirect("/cambiar-clave");
  }

  const tenantName = (profile?.tenant as any)?.name || "";
  // Negocio suspendido por falta de pago: se bloquea el panel (salvo Plan y facturacion).
  // El super admin nunca se bloquea (soporte / impersonacion).
  const isSuspended = (profile?.tenant as any)?.status === "suspended" && profile?.role !== "super_admin";

  // A business with only 1 active team member is a solo/independent professional
  // (e.g. Saray Ovalle running her own account). Items like Recepcion, Lista de Espera
  // and Arriendo assume there's a team to manage, so they're hidden in that case.
  let isSoloBusiness = false;
  if (profile?.tenant_id) {
    const { count } = await createAdminSupabase()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("active", true)
      .in("role", ["admin", "barber", "receptionist"]);
    isSoloBusiness = (count ?? 0) <= 1;
  }

  return (
    <ToastWrapper>
      <AuthWrapper
        serverRole={profile?.role || "barber"}
        serverUserId={user.id}
        serverEmail={user.email || ""}
        serverName={profile?.name || user.email || ""}
        serverTenantId={profile?.tenant_id || null}
      >
        <AppLock />
        <div className="flex h-screen dark:bg-gray-950">
          <Sidebar userName={profile?.name || user.email || ""} userRole={profile?.role || "barber"} tenantName={tenantName} isSoloBusiness={isSoloBusiness} />
          <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 pt-[4.5rem] pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pt-0 lg:pb-0">
            <TenantOverrideBanner />
            <TrialBanner />
            <ErrorBoundary>
              <SuspendedGate suspended={isSuspended} isAdmin={profile?.role === "admin"}>
                {children}
              </SuspendedGate>
            </ErrorBoundary>
            {!isSuspended && <PushNotificationPrompt />}
            {!isSuspended && <QuickActions userRole={profile?.role || "barber"} />}
            {!isSuspended && <MobileTabBar role={profile?.role || "barber"} />}
            {!isSuspended && <CommandPalette />}
          </main>
        </div>
      </AuthWrapper>
    </ToastWrapper>
  );
}
