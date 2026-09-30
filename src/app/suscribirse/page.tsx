"use client";

import { useState, useEffect, useMemo } from "react";

interface Plan {
  plan: string;
  name: string;
  price_clp: number;
  max_professionals: number;
  included_professionals: number | null;
  extra_professional_price_clp: number | null;
}

type BillingPeriod = "monthly" | "annual";

const IVA_RATE = 0.19;
const ANNUAL_DISCOUNT = 0.2;

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export default function SuscribirsePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [professionals, setProfessionals] = useState(1);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    rut_empresa: "",
    admin_name: "",
    admin_email: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) {
          setError("No pudimos cargar los planes. Intenta de nuevo en unos minutos.");
          setLoadingPlans(false);
          return;
        }
        setPlans(data || []);
        if (data?.[0]) {
          // Preseleccion desde la landing: /suscribirse?plan=pro&seats=6&cycle=anual
          const q = new URLSearchParams(window.location.search);
          const wanted = (data as Plan[]).find((p) => p.plan === q.get("plan")) || data[0];
          const included = wanted.included_professionals ?? wanted.max_professionals ?? 1;
          const seats = parseInt(q.get("seats") || "", 10);
          setSelectedPlan(wanted.plan);
          setProfessionals(
            Number.isFinite(seats) ? Math.min(wanted.max_professionals, Math.max(included, seats)) : (wanted.included_professionals || 1)
          );
          const cycle = (q.get("cycle") || "").toLowerCase();
          if (cycle === "anual" || cycle === "annual") setBillingPeriod("annual");
        }
        setLoadingPlans(false);
      })
      .catch(() => {
        setError("No pudimos cargar los planes. Intenta de nuevo en unos minutos.");
        setLoadingPlans(false);
      });
  }, []);

  const plan = plans.find((p) => p.plan === selectedPlan);

  const pricing = useMemo(() => {
    if (!plan) return null;
    const included = plan.included_professionals ?? plan.max_professionals;
    const extraPrice = plan.extra_professional_price_clp || 0;
    const extraCount = Math.max(0, professionals - included);
    const extraTotal = extraCount * extraPrice;
    const netoMensual = plan.price_clp + extraTotal;
    const totalMensual = Math.round(netoMensual * (1 + IVA_RATE));
    const totalAnual = Math.round(totalMensual * 12 * (1 - ANNUAL_DISCOUNT));
    return {
      extraCount,
      totalMensual,
      totalAnual,
      total: billingPeriod === "annual" ? totalAnual : totalMensual,
    };
  }, [plan, professionals, billingPeriod]);

  const selectPlan = (p: Plan) => {
    setSelectedPlan(p.plan);
    setProfessionals(p.included_professionals || 1);
  };

  const decProf = () => {
    if (!plan) return;
    const included = plan.included_professionals ?? plan.max_professionals;
    setProfessionals((n) => Math.max(included, n - 1));
  };
  const incProf = () => {
    if (!plan) return;
    setProfessionals((n) => Math.min(plan.max_professionals, n + 1));
  };

  const slugify = (v: string) =>
    v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedPlan) {
      setError("Selecciona un plan");
      return;
    }
    if (!form.name || !form.admin_email || !form.admin_name) {
      setError("Completa los datos obligatorios");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          slug: form.slug || slugify(form.name),
          plan: selectedPlan,
          professionals,
          billing_period: billingPeriod,
        }),
      });
      const data = await res.json();
      setSubmitting(false);

      if (!res.ok) {
        setError(data.error || "No se pudo iniciar el pago");
        return;
      }

      // Redirect to Mercado Pago to authorize the recurring subscription
      window.location.href = data.initPoint;
    } catch (err) {
      setSubmitting(false);
      setError("Error de conexión. Intenta de nuevo.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl p-6 md:p-8">
        <div className="text-center mb-6">
          <img src="/logo-icon.png" alt="re-booking" className="w-14 h-14 mx-auto mb-3" />
          <img src="/logo-horizontal.png" alt="re-booking" className="h-7 w-auto mx-auto mb-2" />
          <p className="text-xs text-brand-gray mt-1">Contrata re-booking para tu negocio</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-brand-dark mb-1.5 block">Plan</label>
            {loadingPlans ? (
              <p className="text-xs text-brand-gray">Cargando planes...</p>
            ) : (
              <div className="space-y-2">
                {plans.map((p) => (
                  <label
                    key={p.plan}
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                      selectedPlan === p.plan ? "border-brand-blue bg-brand-blue/5" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="plan"
                        checked={selectedPlan === p.plan}
                        onChange={() => selectPlan(p)}
                        className="accent-brand-blue"
                      />
                      <span className="text-sm font-medium text-brand-dark">{p.name}</span>
                    </div>
                    <span className="text-sm font-bold text-brand-dark">
                      {fmt(p.price_clp)}/mes desde
                    </span>
                  </label>
                ))}
              </div>
            )}
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
                  onClick={decProf}
                  disabled={professionals <= (plan.included_professionals ?? plan.max_professionals)}
                  className="w-8 h-8 rounded-lg border border-gray-300 text-brand-dark font-bold disabled:opacity-30"
                >
                  –
                </button>
                <span className="text-base font-bold text-brand-dark w-5 text-center">{professionals}</span>
                <button
                  type="button"
                  onClick={incProf}
                  disabled={professionals >= plan.max_professionals}
                  className="w-8 h-8 rounded-lg border border-gray-300 text-brand-dark font-bold disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="flex rounded-xl border border-gray-200 p-1 bg-brand-light/50">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                billingPeriod === "monthly" ? "bg-white shadow text-brand-dark" : "text-brand-gray"
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("annual")}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                billingPeriod === "annual" ? "bg-white shadow text-brand-dark" : "text-brand-gray"
              }`}
            >
              Anual (20% dcto.)
            </button>
          </div>

          {pricing && (
            <div className="rounded-xl border border-gray-200 p-4 bg-brand-light/40">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-brand-dark">
                  Total {billingPeriod === "annual" ? "anual" : "mensual"}
                </span>
                <span className="text-xl font-bold text-brand-blue">{fmt(pricing.total)}</span>
              </div>
              <p className="text-[10px] text-brand-gray mt-1">IVA incluido</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              placeholder="Nombre del negocio"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />
            <input
              type="text"
              placeholder="RUT empresa (opcional)"
              value={form.rut_empresa}
              onChange={(e) => setForm({ ...form, rut_empresa: e.target.value })}
              className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />
            <input
              type="text"
              placeholder="Tu nombre completo"
              value={form.admin_name}
              onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
              required
              className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />
            <input
              type="email"
              placeholder="tu@email.com"
              value={form.admin_email}
              onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
              required
              className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />
            <input
              type="tel"
              placeholder="Telefono (opcional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2">{error}</p>}

          <button
            type="submit"
            disabled={submitting || loadingPlans}
            className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50 transition-all"
          >
            {submitting ? "Redirigiendo a Mercado Pago..." : "Continuar con Mercado Pago"}
          </button>

          <p className="text-[10px] text-brand-gray text-center">
            {billingPeriod === "annual"
              ? "Pagas una sola vez por todo el año con Mercado Pago. Te avisaremos por email antes de que venza para que renueves cuando quieras."
              : "Autorizarás a Mercado Pago a cobrar tu suscripción automáticamente cada mes. Usa el mismo email de tu cuenta de Mercado Pago. Puedes cancelarla cuando quieras."}
          </p>
        </form>
      </div>
    </div>
  );
}
