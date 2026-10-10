"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useIsNativeApp } from "@/lib/native-app";
import { useTenant } from "@/lib/tenant-context";
import { Monitor } from "lucide-react";

interface Plan {
  plan: string;
  name: string;
  price_clp: number;
  max_professionals: number;
  included_professionals: number | null;
  extra_professional_price_clp: number | null;
}

interface Subscription {
  plan: string;
  status: string;
  amount: number;
  billing_period: "monthly" | "annual";
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  grace_until: string | null;
}

function fmt(n: number) {
  return "$" + Math.round(n || 0).toLocaleString("es-CL");
}

function FacturacionContent() {
  const { showToast } = useToast();
  const [tenant, setTenant] = useState<{ plan: string; max_professionals: number; status: string } | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [professionals, setProfessionals] = useState(1);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/billing/summary")
      .then((r) => r.json())
      .then((data) => {
        setTenant(data.tenant || null);
        setSubscription(data.subscription || null);
        setPlans(data.plans || []);
        setSelectedPlan(data.tenant?.plan || data.plans?.[0]?.plan || "");
        setProfessionals(data.tenant?.max_professionals || 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    // Al volver de Mercado Pago tras reactivar, MP agrega ?preapproval_id=...: se confirma en el servidor.
    const pid = new URLSearchParams(window.location.search).get("preapproval_id");
    if (pid) {
      fetch("/api/billing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preapproval_id: pid }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok && d.status === "authorized") showToast("Suscripción reactivada", "success");
        })
        .catch(() => {})
        .finally(() => {
          window.history.replaceState({}, "", window.location.pathname);
          window.location.reload();
        });
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [reactivating, setReactivating] = useState(false);
  const handleReactivate = async () => {
    setReactivating(true);
    try {
      const res = await fetch("/api/billing/reactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setReactivating(false);
        showToast(data.error || "No se pudo iniciar la reactivación", "error");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setReactivating(false);
      showToast("Error de conexión", "error");
    }
  };

  const plan = plans.find((p) => p.plan === selectedPlan);

  const handleChangePlan = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, professionals }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) {
        showToast(data.error || "No se pudo cambiar el plan", "error");
        return;
      }
      if (data.checkoutUrl) {
        // Plan anual: se paga la diferencia con Mercado Pago y el cambio se aplica al confirmarse.
        window.location.href = data.checkoutUrl;
        return;
      }
      showToast("Plan actualizado", "success");
      fetchData();
    } catch {
      setSaving(false);
      showToast("Error de conexión", "error");
    }
  };

  const [renewing, setRenewing] = useState(false);
  const handleRenew = async () => {
    setRenewing(true);
    try {
      const res = await fetch("/api/billing/renew", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setRenewing(false);
        showToast(data.error || "No se pudo generar el link de pago", "error");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setRenewing(false);
      showToast("Error de conexión", "error");
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      setCancelling(false);
      setShowCancelConfirm(false);
      if (!res.ok) {
        showToast(data.error || "No se pudo cancelar la suscripción", "error");
        return;
      }
      showToast("Suscripción cancelada", "success");
      fetchData();
    } catch {
      setCancelling(false);
      showToast("Error de conexión", "error");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-brand-gray">Cargando...</div>;
  }

  const isCancelled = subscription?.status === "cancelled";
  const isAnnualOneTime = subscription?.billing_period === "annual" && !subscription?.mp_preapproval_id;
  const needsPayment = tenant?.status === "past_due" || tenant?.status === "suspended";
  const canReactivateMonthly = needsPayment && subscription?.billing_period === "monthly" && !!subscription?.mp_preapproval_id;
  const hasActiveSubscription = (!!subscription?.mp_preapproval_id || isAnnualOneTime) && !isCancelled;

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-3 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-brand-dark">Plan y facturación</h1>
        <p className="text-sm text-brand-gray mt-1">Administra tu suscripción a re-booking.</p>
      </div>

      {canReactivateMonthly && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-700">
            {tenant?.status === "suspended" ? "Tu cuenta está suspendida por falta de pago" : "No pudimos cobrar tu último pago"}
          </p>
          <p className="text-xs text-red-700/80 mt-1">
            Para volver a usar re-booking, autoriza el cobro con una tarjeta que funcione. Se cobra {fmt(subscription?.amount || 0)}{" "}
            ahora y tu suscripción queda activa de nuevo (reemplaza a la anterior).
          </p>
          <button
            type="button"
            onClick={handleReactivate}
            disabled={reactivating}
            className="mt-3 h-10 px-4 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
          >
            {reactivating ? "Redirigiendo..." : "Reactivar mi suscripción"}
          </button>
        </div>
      )}

      {subscription && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-dark">Suscripción actual</p>
              <p className="text-xs text-brand-gray mt-0.5">
                Plan {plans.find((p) => p.plan === subscription.plan)?.name || subscription.plan} ·{" "}
                {subscription.billing_period === "annual" ? "anual" : "mensual"}
              </p>
            </div>
            <span className="text-lg font-bold text-brand-dark">{fmt(subscription.amount)}</span>
          </div>
          {subscription.current_period_end && (
            <p className="text-xs text-brand-gray mt-2">
              {isAnnualOneTime ? "Tu plan anual vence el" : "Próxima renovación:"}{" "}
              {new Date(subscription.current_period_end).toLocaleDateString("es-CL")}
            </p>
          )}
          {isAnnualOneTime && !isCancelled && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleRenew}
                disabled={renewing}
                className="h-10 px-4 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50"
              >
                {renewing ? "Redirigiendo..." : "Renovar por otro año"}
              </button>
              <p className="text-[11px] text-brand-gray">El plan anual no se renueva solo; te avisamos por email antes de que venza.</p>
            </div>
          )}
          {isCancelled && (
            <p className="text-xs text-red-600 mt-2 font-medium">
              Suscripción cancelada. Se mantiene el acceso hasta el fin del periodo pagado.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <p className="text-sm font-semibold text-brand-dark">Mejorar tu plan</p>

        <div className="space-y-2">
          {plans.map((p) => (
            <label
              key={p.plan}
              className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer ${
                selectedPlan === p.plan ? "border-brand-blue bg-brand-blue/5" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="plan"
                  checked={selectedPlan === p.plan}
                  onChange={() => {
                    setSelectedPlan(p.plan);
                    setProfessionals(p.included_professionals || 1);
                  }}
                  className="accent-brand-blue"
                />
                <span className="text-sm font-medium text-brand-dark">{p.name}</span>
              </div>
              <span className="text-sm font-bold text-brand-dark">{fmt(p.price_clp)}/mes desde</span>
            </label>
          ))}
        </div>

        {plan && (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium text-brand-dark">Profesionales</p>
              <p className="text-[11px] text-brand-gray">
                {plan.included_professionals || plan.max_professionals} incluidos en el plan
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setProfessionals((n) => Math.max(plan.included_professionals || 1, n - 1))
                }
                disabled={professionals <= (plan.included_professionals ?? plan.max_professionals)}
                className="w-8 h-8 rounded-lg border border-gray-300 text-brand-dark font-bold disabled:opacity-30"
              >
                –
              </button>
              <span className="text-base font-bold text-brand-dark w-5 text-center">{professionals}</span>
              <button
                type="button"
                onClick={() => setProfessionals((n) => Math.min(plan.max_professionals, n + 1))}
                disabled={professionals >= plan.max_professionals}
                className="w-8 h-8 rounded-lg border border-gray-300 text-brand-dark font-bold disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleChangePlan}
          disabled={saving || !hasActiveSubscription || needsPayment}
          className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50"
        >
          {saving ? "Procesando..." : isAnnualOneTime ? "Mejorar tu plan (pagar diferencia)" : "Mejorar tu plan"}
        </button>
        {needsPayment && hasActiveSubscription && (
          <p className="text-[11px] text-brand-gray">Primero regulariza el pago para poder cambiar de plan.</p>
        )}
        {!hasActiveSubscription && (
          <p className="text-[11px] text-brand-gray">
            Este negocio no tiene una suscripción de pago activa, así que este cambio no aplica todavía.
          </p>
        )}
      </div>

      {hasActiveSubscription && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm font-semibold text-brand-dark">Cancelar tu suscripción</p>
          <p className="text-xs text-brand-gray mt-1">
            {isAnnualOneTime
              ? "Dejaremos de enviarte avisos de renovación. Mantienes acceso hasta el fin del periodo ya pagado."
              : "Dejarás de pagar automáticamente. Mantienes acceso hasta el fin del periodo ya pagado."}
          </p>
          {!showCancelConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="mt-3 h-10 px-4 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50"
            >
              Cancelar tu suscripción
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="h-10 px-4 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelando..." : "Si, cancelar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="h-10 px-4 rounded-xl border border-gray-300 text-brand-dark text-sm font-medium"
              >
                Volver
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dentro de la app movil solo se muestra el plan y su vencimiento (reglas de Apple y Google):
// sin precios, sin botones de pago y sin enlaces. La gestion se hace desde un computador.
function InAppPlanInfo() {
  const { tenant } = useTenant();
  const [planName, setPlanName] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Solo el administrador puede pedir el resumen; si no, se usa lo que ya sabe el negocio.
    fetch("/api/billing/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.subscription) {
          setPeriodEnd(data.subscription.current_period_end || null);
          const p = (data.plans || []).find((x: any) => x.plan === data.subscription.plan);
          setPlanName(p?.name || data.subscription.plan || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const onTrial = tenant?.status === "trial";
  const endDate = onTrial ? tenant?.trial_ends_at : periodEnd || tenant?.trial_ends_at;
  const dateLabel = endDate ? new Date(endDate).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : null;
  const plan = planName || (tenant?.plan ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1) : null);
  const suspended = tenant?.status === "suspended";

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
          <Monitor className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-bold text-brand-dark">Plan y facturación</h1>

        {!loaded && !tenant ? (
          <p className="text-sm text-brand-gray">Cargando...</p>
        ) : (
          <div className="space-y-1.5 rounded-xl bg-brand-light p-4">
            {plan && <p className="text-sm font-semibold text-brand-dark">{onTrial ? "Período de prueba" : `Plan ${plan}`}</p>}
            {suspended ? (
              <p className="text-sm font-medium text-red-600">Cuenta suspendida</p>
            ) : dateLabel ? (
              <p className="text-sm text-brand-gray">
                {onTrial ? "La prueba vence el" : "Vence el"} <strong className="text-brand-dark">{dateLabel}</strong>
              </p>
            ) : (
              <p className="text-sm text-brand-gray">Sin fecha de vencimiento registrada.</p>
            )}
          </div>
        )}

        <p className="text-xs text-brand-gray">
          Para cambiar de plan o ver la facturación, ingresa a re-booking desde un computador.
        </p>
      </div>
    </div>
  );
}

export default function FacturacionPage() {
  const inApp = useIsNativeApp();
  if (inApp) return <InAppPlanInfo />;
  return <FacturacionContent />;
}
