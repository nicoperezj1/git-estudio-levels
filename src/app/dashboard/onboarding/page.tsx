"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/components/ui/toast";
import { Spinner, SpinnerInline } from "@/components/ui/spinner";
import { compressImage } from "@/lib/image-compress";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";
import {
  PartyPopper,
  Building2,
  Users,
  Scissors,
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
} from "lucide-react";

// Item 37 (Nico, 27-sep): wizard de bienvenida para negocios nuevos.
//
// 6 pasos: Bienvenida -> Datos del negocio -> Equipo -> Servicios -> Horarios -> Final.
// Todo se guarda en la base real a medida que se avanza (no en localStorage), reusando los
// mismos endpoints que ya usa Configuracion/Servicios/Equipo, para que si el usuario cierra
// la pestaña a mitad de camino, lo que ya cargo no se pierda y pueda seguir donde iba (el
// paso actual se guarda en tenants.onboarding_step via /api/onboarding).
const TOTAL_STEPS = 6;
const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

interface DaySchedule {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface Professional {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
}

interface ServiceRow {
  id: string;
  name: string;
  price: number;
  duration: number;
}

export default function OnboardingPage() {
  const { tenant, loading: tenantLoading } = useTenant();
  const { showToast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // Paso 2: Datos del negocio
  const [businessData, setBusinessData] = useState({ name: "", address: "", phone: "", website: "", social_media: "", business_category: "" });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Paso 3: Equipo
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [newPro, setNewPro] = useState({ name: "", email: "", phone: "" });
  const [addingPro, setAddingPro] = useState(false);

  // Paso 4: Servicios
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [newService, setNewService] = useState({ name: "", price: "", duration: "30" });
  const [addingService, setAddingService] = useState(false);

  // Paso 5: Horarios
  const [hours, setHours] = useState<DaySchedule[]>(
    dayNames.map((_, i) => ({ day_of_week: i, open_time: "10:00", close_time: "21:00", is_closed: i === 0 }))
  );

  // Retomar donde quedo (tenants.onboarding_step) apenas se conoce el tenant.
  useEffect(() => {
    if (tenantLoading || !tenant || initialized) return;
    if (tenant.onboarding_completed) {
      router.replace("/dashboard");
      return;
    }
    setStep(Math.min(Math.max(tenant.onboarding_step || 0, 0), TOTAL_STEPS - 1));
    setBusinessData((prev) => ({ ...prev, name: tenant.name || "" }));
    setInitialized(true);
  }, [tenantLoading, tenant, initialized, router]);

  // Cargar equipo cuando se llega al paso 3
  useEffect(() => {
    if (step !== 2 || !tenant?.id) return;
    setLoadingTeam(true);
    fetch(`/api/barberos?tenantId=${tenant.id}`)
      .then((r) => r.json())
      .then((data) => setProfessionals(Array.isArray(data) ? data.filter((p: Professional) => p.role === "barber") : []))
      .finally(() => setLoadingTeam(false));
  }, [step, tenant?.id]);

  // Cargar servicios cuando se llega al paso 4
  useEffect(() => {
    if (step !== 3 || !tenant?.id) return;
    setLoadingServices(true);
    fetch(`/api/services?all=true&tenantId=${tenant.id}`)
      .then((r) => r.json())
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .finally(() => setLoadingServices(false));
  }, [step, tenant?.id]);

  const persistStep = useCallback(
    async (nextStep: number, completed = false) => {
      if (!tenant?.id) return;
      try {
        await fetch("/api/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: tenant.id, step: nextStep, completed }),
        });
      } catch {
        // No bloquea la navegacion del wizard si esto falla — solo significa que, si
        // cierra la pestaña ahora, retomaria un paso antes de donde realmente iba.
      }
    },
    [tenant?.id]
  );

  const goNext = async () => {
    const next = Math.min(step + 1, TOTAL_STEPS - 1);
    setStep(next);
    await persistStep(next);
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const saveBusinessStep = async () => {
    if (!tenant?.id) return;
    if (!businessData.name.trim()) {
      showToast("El nombre del negocio es obligatorio", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, business: businessData }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        showToast(result.error || "No se pudo guardar", "error");
        return;
      }
      await goNext();
    } catch {
      showToast("No se pudo guardar. Revisa tu conexion.", "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original || !tenant?.id) return;
    if (!original.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(original.name)) {
      showToast("El archivo debe ser una imagen (JPG, PNG, WEBP)", "error");
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    try {
      const file = await compressImage(original, { maxBytes: 5 * 1024 * 1024 });
      const form = new FormData();
      form.append("file", file);
      form.append("tenantId", tenant.id);
      const res = await fetch("/api/settings/logo", { method: "POST", body: form });
      const result = await res.json();
      if (res.ok) {
        setLogoUrl(result.url);
        showToast("Logo subido", "success");
      } else {
        showToast(result.error || "Error al subir logo", "error");
      }
    } catch (err: any) {
      showToast(err?.message || "No se pudo procesar la imagen", "error");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const addProfessional = async () => {
    if (!tenant?.id) return;
    if (!newPro.name.trim() || !newPro.email.trim()) {
      showToast("Nombre y email son obligatorios", "error");
      return;
    }
    setAddingPro(true);
    try {
      const res = await fetch("/api/barberos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPro, role: "barber", tenantId: tenant.id }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "No se pudo agregar", "error");
        return;
      }
      setProfessionals((prev) => [...prev, { id: result.id, name: newPro.name, email: newPro.email, phone: newPro.phone, role: "barber" }]);
      setNewPro({ name: "", email: "", phone: "" });
      showToast("Profesional agregado. Le enviamos sus credenciales por email.", "success");
    } catch {
      showToast("No se pudo agregar. Revisa tu conexion.", "error");
    } finally {
      setAddingPro(false);
    }
  };

  const addService = async () => {
    if (!tenant?.id) return;
    if (!newService.name.trim() || !newService.price) {
      showToast("Nombre y precio son obligatorios", "error");
      return;
    }
    setAddingService(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newService.name,
          price: parseInt(newService.price, 10),
          duration: parseInt(newService.duration, 10) || 30,
          tenantId: tenant.id,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "No se pudo agregar", "error");
        return;
      }
      setServices((prev) => [...prev, result]);
      setNewService({ name: "", price: "", duration: "30" });
    } catch {
      showToast("No se pudo agregar. Revisa tu conexion.", "error");
    } finally {
      setAddingService(false);
    }
  };

  const updateDay = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setHours((prev) => prev.map((h) => (h.day_of_week === dayIndex ? { ...h, [field]: value } : h)));
  };

  const saveHoursStep = async () => {
    if (!tenant?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, hours }),
      });
      if (!res.ok) {
        showToast("No se pudieron guardar los horarios", "error");
        return;
      }
      await goNext();
    } catch {
      showToast("No se pudo guardar. Revisa tu conexion.", "error");
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!tenant?.id) return;
    setSaving(true);
    await persistStep(TOTAL_STEPS - 1, true);
    // Recarga completa para que TenantProvider vuelva a pedir /api/tenant/info y el
    // dashboard normal (que chequea tenant.onboarding_completed) deje de redirigir aca.
    window.location.href = "/dashboard";
  };

  if (tenantLoading || !initialized) return <Spinner text="Preparando tu negocio..." />;

  const atMaxProfessionals =
    typeof tenant?.max_professionals === "number" && professionals.length >= tenant.max_professionals;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Progreso */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-brand-gray">Paso {step + 1} de {TOTAL_STEPS}</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-blue rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-brand-white rounded-2xl border border-gray-100 dark:border-white/10 p-6 md:p-8">
        {/* Paso 0: Bienvenida */}
        {step === 0 && (
          <div className="text-center py-6">
            <PartyPopper className="w-12 h-12 text-brand-blue mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-brand-dark mb-2">Bienvenido a re-booking, {tenant?.name}!</h1>
            <p className="text-brand-gray text-sm max-w-md mx-auto mb-6">
              Antes de empezar a recibir reservas, configuremos juntos los datos basicos de tu negocio.
              Toma solo unos minutos y puedes editar todo despues desde Configuracion.
            </p>
            <button
              onClick={goNext}
              className="inline-flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90"
            >
              Comenzar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Paso 1: Datos del negocio */}
        {step === 1 && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-5 h-5 text-brand-blue" />
              <h2 className="text-lg font-bold text-brand-dark">Datos de tu negocio</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-brand-gray">Nombre del negocio *</label>
                <input
                  value={businessData.name}
                  onChange={(e) => setBusinessData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Rubro del negocio</label>
                <select
                  value={businessData.business_category}
                  onChange={(e) => setBusinessData((p) => ({ ...p, business_category: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                >
                  <option value="">Selecciona una opcion</option>
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Direccion</label>
                <input
                  value={businessData.address}
                  onChange={(e) => setBusinessData((p) => ({ ...p, address: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-brand-gray">Telefono</label>
                  <input
                    value={businessData.phone}
                    onChange={(e) => setBusinessData((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-gray">Sitio web</label>
                  <input
                    value={businessData.website}
                    onChange={(e) => setBusinessData((p) => ({ ...p, website: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Redes sociales</label>
                <input
                  value={businessData.social_media}
                  onChange={(e) => setBusinessData((p) => ({ ...p, social_media: e.target.value }))}
                  placeholder="@tuinstagram"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Logo (opcional)</label>
                <div className="flex items-center gap-3 mt-1">
                  {logoUrl && <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />}
                  <label className="text-sm text-brand-blue font-medium cursor-pointer">
                    {uploadingLogo ? "Subiendo..." : logoUrl ? "Cambiar logo" : "Subir logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} disabled={uploadingLogo} />
                  </label>
                </div>
              </div>
            </div>
            <StepFooter onBack={goBack} onNext={saveBusinessStep} saving={saving} showBack={false} />
          </div>
        )}

        {/* Paso 2: Equipo */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-brand-blue" />
              <h2 className="text-lg font-bold text-brand-dark">Tu equipo</h2>
            </div>
            <p className="text-sm text-brand-gray mb-4">
              Agrega a los profesionales que atenderan citas. Puedes agregar mas despues desde Equipo.
            </p>
            {loadingTeam ? (
              <SpinnerInline />
            ) : (
              <div className="space-y-2 mb-4">
                {professionals.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{p.name}</p>
                      <p className="text-xs text-brand-gray">{p.email}</p>
                    </div>
                  </div>
                ))}
                {professionals.length === 0 && <p className="text-sm text-brand-gray">Aun no has agregado profesionales.</p>}
              </div>
            )}
            {atMaxProfessionals ? (
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 rounded-lg">
                Alcanzaste el limite de profesionales de tu plan actual ({tenant?.max_professionals}). Mejora tu plan para agregar mas.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs font-semibold text-brand-gray">Nombre</label>
                  <input
                    value={newPro.name}
                    onChange={(e) => setNewPro((p) => ({ ...p, name: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-gray">Email</label>
                  <input
                    value={newPro.email}
                    onChange={(e) => setNewPro((p) => ({ ...p, email: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                  />
                </div>
                <button
                  onClick={addProfessional}
                  disabled={addingPro}
                  className="flex items-center justify-center gap-1.5 bg-brand-dark/5 dark:bg-white/10 text-brand-dark dark:text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark/10"
                >
                  <Plus className="w-4 h-4" /> {addingPro ? "Agregando..." : "Agregar"}
                </button>
              </div>
            )}
            <StepFooter onBack={goBack} onNext={goNext} saving={false} />
          </div>
        )}

        {/* Paso 3: Servicios */}
        {step === 3 && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <Scissors className="w-5 h-5 text-brand-blue" />
              <h2 className="text-lg font-bold text-brand-dark">Tus servicios</h2>
            </div>
            <p className="text-sm text-brand-gray mb-4">
              Agrega los servicios que ofreces (ej. Corte, Barba). Puedes agregar mas despues desde Servicios.
            </p>
            {loadingServices ? (
              <SpinnerInline />
            ) : (
              <div className="space-y-2 mb-4">
                {services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                    <span className="text-sm font-semibold text-brand-dark">{s.name}</span>
                    <span className="text-xs text-brand-gray">${s.price} · {s.duration} min</span>
                  </div>
                ))}
                {services.length === 0 && <p className="text-sm text-brand-gray">Aun no has agregado servicios.</p>}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-xs font-semibold text-brand-gray">Nombre</label>
                <input
                  value={newService.name}
                  onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Precio</label>
                <input
                  type="number"
                  value={newService.price}
                  onChange={(e) => setNewService((p) => ({ ...p, price: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-gray">Duracion (min)</label>
                <input
                  type="number"
                  value={newService.duration}
                  onChange={(e) => setNewService((p) => ({ ...p, duration: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                />
              </div>
              <button
                onClick={addService}
                disabled={addingService}
                className="flex items-center justify-center gap-1.5 bg-brand-dark/5 dark:bg-white/10 text-brand-dark dark:text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark/10"
              >
                <Plus className="w-4 h-4" /> {addingService ? "Agregando..." : "Agregar"}
              </button>
            </div>
            <StepFooter onBack={goBack} onNext={goNext} saving={false} />
          </div>
        )}

        {/* Paso 4: Horarios */}
        {step === 4 && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <Clock className="w-5 h-5 text-brand-blue" />
              <h2 className="text-lg font-bold text-brand-dark">Horario de atencion</h2>
            </div>
            <div className="space-y-2">
              {hours.map((day) => (
                <div key={day.day_of_week} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-white/5 last:border-0">
                  <span className="text-sm text-brand-dark font-medium w-24">{dayNames[day.day_of_week]}</span>
                  <label className="flex items-center gap-1.5 text-xs text-brand-gray">
                    <input
                      type="checkbox"
                      checked={day.is_closed}
                      onChange={(e) => updateDay(day.day_of_week, "is_closed", e.target.checked)}
                    />
                    Cerrado
                  </label>
                  {!day.is_closed && (
                    <>
                      <input
                        type="time"
                        value={day.open_time}
                        onChange={(e) => updateDay(day.day_of_week, "open_time", e.target.value)}
                        className="px-2 py-1 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                      />
                      <span className="text-xs text-brand-gray">a</span>
                      <input
                        type="time"
                        value={day.close_time}
                        onChange={(e) => updateDay(day.day_of_week, "close_time", e.target.value)}
                        className="px-2 py-1 border border-gray-200 dark:border-white/10 rounded-lg text-sm bg-transparent"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
            <StepFooter onBack={goBack} onNext={saveHoursStep} saving={saving} />
          </div>
        )}

        {/* Paso 5: Final */}
        {step === 5 && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-brand-dark mb-2">Todo listo!</h1>
            <p className="text-brand-gray text-sm max-w-md mx-auto mb-6">
              Ya configuraste lo basico de {tenant?.name}. Puedes seguir ajustando cualquier detalle desde
              Configuracion, Equipo o Servicios cuando quieras.
            </p>
            <button
              onClick={finish}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Entrando..." : "Ir a mi dashboard"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepFooter({
  onBack,
  onNext,
  saving,
  showBack = true,
}: {
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-white/10">
      {showBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-brand-gray font-medium hover:text-brand-dark">
          <ArrowLeft className="w-4 h-4" /> Atras
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={onNext}
        disabled={saving}
        className="inline-flex items-center gap-2 bg-brand-blue text-white px-5 py-2.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Continuar"} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
