"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { BarberScheduleEditor } from "@/components/barber-schedule-editor";
import { BarberServicesEditor } from "@/components/barber-services-editor";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";

interface Professional {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  work_mode: "commission" | "rental";
  commission_rate: number;
  rental_daily_rate: number;
  rental_min_days: number;
  rental_max_days: number;
  rental_deductions: number;
  rental_notes: string | null;
  personal_pin: string | null;
  active: boolean;
  avatar_url: string | null;
  role: string;
}

export default function EditProfessionalPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<Professional | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { effectiveRole } = useAuth();
  const { tenant } = useTenant();
  // A receptionist opening a professional only manages their work schedule; everything
  // else on this screen (personal data, work mode, PIN, services, presentation) is
  // hidden.
  const scheduleOnly = effectiveRole === "receptionist";

  useEffect(() => {
    fetch(`/api/barberos/${params.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.id) setData(d); })
      .finally(() => setLoading(false));
  }, [params.id]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    const res = await fetch(`/api/barberos/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        phone: data.phone,
        birth_date: (data as any).birth_date || null,
        work_mode: data.work_mode,
        commission_rate: data.commission_rate,
        rental_daily_rate: data.rental_daily_rate,
        rental_min_days: data.rental_min_days,
        rental_max_days: data.rental_max_days,
        rental_deductions: data.rental_deductions,
        rental_notes: data.rental_notes,
        personal_pin: data.personal_pin,
        slot_duration: (data as any).slot_duration,
        bio: (data as any).bio,
        specialties: (data as any).specialties,
        intro_video_url: (data as any).intro_video_url,
        years_experience: (data as any).years_experience,
        also_attends_clients: (data as any).also_attends_clients,
        instagram: (data as any).instagram,
        rental_cash_to_barber: (data as any).rental_cash_to_barber,
        // Solo se manda para recepcion (columna nueva, migracion 089): asi guardar a cualquier
        // otro perfil nunca depende de que el SQL ya este aplicado.
        ...(isReceptionistProfile ? { manager_name: (data as any).manager_name || null } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      showToast("Perfil actualizado", "success");
    } else {
      showToast("Error al guardar", "error");
    }
  };

  // Save only the basic presentation fields (bio + instagram). Used by the receptionist
  // view, which can't touch anything else. The photo is saved separately by its own
  // upload endpoint the moment it's picked, so it's not part of this.
  const saveBasic = async () => {
    if (!data) return;
    setSaving(true);
    const res = await fetch(`/api/barberos/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio: (data as any).bio,
        instagram: (data as any).instagram,
      }),
    });
    setSaving(false);
    showToast(res.ok ? "Datos actualizados" : "Error al guardar", res.ok ? "success" : "error");
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/barberos/${params.id}/avatar`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        setData({ ...data, avatar_url: result.url });
        showToast("Foto de perfil actualizada", "success");
      } else {
        showToast("Error al subir foto", "error");
      }
    } catch {
      showToast("Error al subir foto", "error");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const removeAvatar = async () => {
    if (!data) return;
    await fetch(`/api/barberos/${params.id}/avatar`, { method: "DELETE" });
    setData({ ...data, avatar_url: null });
    showToast("Foto eliminada", "success");
  };

  if (loading) return <Spinner />;
  if (!data) return <p className="p-6 text-center text-gray-500">Profesional no encontrado</p>;

  // Ficha de una persona con cargo Recepcionista: no es profesional de agenda, asi que se ocultan
  // link de agenda, duracion de slot, modalidad, comision, horario, servicios y presentacion, y se
  // muestra "Nombre de encargado" (el saludo "Hola David" en Caja y Punto de Venta).
  const isReceptionistProfile = (data as any).role === "receptionist";

  // Receptionist view: basic presentation data (photo, Instagram, bio) + work
  // schedule. Everything else (work mode, rates, PIN, email/phone, delete) stays hidden.
  if (scheduleOnly) {
    return (
      <div className="p-3 md:p-6 max-w-2xl mx-auto space-y-3 md:space-y-6 animate-fade-in">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-blue-600">← Volver</button>

        {/* Photo + name */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            {data.avatar_url ? (
              <img src={data.avatar_url} alt={data.name} className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600">
                {data.name?.[0] || "?"}
              </div>
            )}
            <label className={`absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${uploadingAvatar ? "opacity-100" : ""}`}>
              <span className="text-white text-xs font-medium">{uploadingAvatar ? "..." : "📷"}</span>
              <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" disabled={uploadingAvatar} />
            </label>
            {data.avatar_url && (
              <button onClick={removeAvatar}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">✕</button>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            <p className="text-xs text-gray-400">Toca la foto para cambiarla</p>
          </div>
        </div>

        {/* Basic presentation (photo already handled above) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Datos basicos</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Instagram</label>
            <input type="text" value={(data as any).instagram || ""}
              onChange={(e) => setData({ ...data, instagram: e.target.value } as any)}
              placeholder="@usuario o link"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Descripcion</label>
            <textarea value={(data as any).bio || ""} rows={3}
              onChange={(e) => setData({ ...data, bio: e.target.value } as any)}
              placeholder="Ej: Especialista en cortes clasicos y barba. 5 años de experiencia."
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <button onClick={saveBasic} disabled={saving}
            className="w-full py-2.5 bg-brand-blue text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar datos"}
          </button>
        </div>

        {/* Work schedule */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Horario de Trabajo</h2>
          <p className="text-xs text-gray-400">Define dias y horas. Esto determina disponibilidad en la agenda online.</p>
          <BarberScheduleEditor barberId={params.id as string} showToast={showToast} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-2xl mx-auto space-y-3 md:space-y-6 animate-fade-in">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-blue-600">← Volver</button>

      <div className="flex items-center gap-4">
        <div className="relative group">
          {data.avatar_url ? (
            <img src={data.avatar_url} alt={data.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600">
              {data.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
          )}
          <label className={`absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${uploadingAvatar ? "opacity-100" : ""}`}>
            <span className="text-white text-xs font-medium">{uploadingAvatar ? "..." : "📷"}</span>
            <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" disabled={uploadingAvatar} />
          </label>
          {data.avatar_url && (
            <button onClick={removeAvatar}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              ✕
            </button>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            data.work_mode === "commission" ? "bg-purple-100 text-purple-700" : "bg-orange-100 text-orange-700"
          }`}>
            {data.work_mode === "commission" ? "Comisión" : "Arriendo"}
          </span>
        </div>
      </div>

      {/* Personal booking link */}
      {!isReceptionistProfile && (
      <div className="bg-brand-light border border-brand-blue/20 rounded-2xl p-4">
        <p className="text-xs text-brand-gray font-medium mb-1.5">Link de agenda personal</p>
        <div className="flex items-center gap-2">
          {/* Short readable link using the barber's unique booking_slug:
              /b/<tenant>/<barber-slug>. Falls back to the barberId link if the slug or
              tenant slug isn't available yet. Both resolve to the correct barber
              unambiguously (no more "any available barber"). */}
          {(() => {
            const origin = typeof window !== "undefined" ? window.location.origin : "https://re-booking.cl";
            // Prefer the SHORT readable link: /<tenant-slug>/<barber-slug>
            // (e.g. re-booking.cl/estudiolevels/javier-garcia). Both the tenant slug and
            // the barber's booking_slug must exist; if either isn't ready yet we fall
            // back to /pro/<uuid>, which is longer but still resolves the right barber.
            const barberSlug = (data as any).booking_slug as string | undefined;
            const tenantSlug = (data as any).tenant_slug || tenant?.slug;
            const bookingLink = barberSlug && tenantSlug
              ? `${origin}/${tenantSlug}/${barberSlug}`
              : `${origin}/pro/${data.id}`;
            return (
              <>
                <code className="flex-1 text-sm text-brand-blue bg-white px-3 py-2 rounded-xl border border-gray-200 truncate">
                  {bookingLink.replace(/^https?:\/\//, "")}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(bookingLink);
                    showToast("Link copiado!", "success");
                  }}
                  className="px-3 py-2 bg-brand-blue text-white text-xs rounded-xl hover:opacity-90 flex-shrink-0"
                >
                  Copiar
                </button>
              </>
            );
          })()}
        </div>
        <p className="text-[10px] text-brand-gray mt-2">Comparte este link en Instagram, WhatsApp o redes sociales para que tus clientes agenden directo contigo.</p>
      </div>

      )}

      {/* Basic info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Datos Personales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
            <input type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <div className="flex gap-2">
              <input type="email" value={data.email || ""} onChange={(e) => setData({ ...data, email: e.target.value })}
                className="flex-1 border rounded-xl px-3 py-2.5 text-sm" />
              <button
                onClick={async () => {
                  if (!data.email) { showToast("No tiene email", "error"); return; }
                  // This generates a BRAND NEW random password and overwrites the current
                  // one — it will invalidate whatever password the professional is using
                  // right now. Confirm explicitly so this is never triggered by accident.
                  const ok = await confirm({
                    title: "Enviar credenciales",
                    message: `Esto va a generar una contraseña nueva para ${data.name} y anulara la que esta usando ahora. Se le enviara por correo a ${data.email}. Continuar?`,
                    confirmText: "Si, generar nueva",
                    variant: "warning",
                  });
                  if (!ok) return;
                  const res = await fetch("/api/barberos/resend-credentials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Send the profile id (the row on screen), not just the email —
                    // resolving by id avoids the duplicate-email ambiguity that made this
                    // fail before.
                    body: JSON.stringify({ profileId: data.id, email: data.email, name: data.name }),
                  });
                  const result = await res.json();
                  if (result.success) showToast("Email enviado", "success");
                  else showToast(result.error || "Error al enviar", "error");
                }}
                className="px-3 py-2 bg-brand-blue/10 text-brand-blue text-xs rounded-xl hover:bg-brand-blue/20 whitespace-nowrap font-medium"
              >
                Enviar credenciales
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
            <input type="text" value={data.phone || ""} onChange={(e) => setData({ ...data, phone: e.target.value })}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
            <input type="date" value={(data as any).birth_date || ""}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setData({ ...data, birth_date: e.target.value } as any)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PIN Personal (Standby)</label>
            <input type="text" value={data.personal_pin || ""} maxLength={4}
              onChange={(e) => setData({ ...data, personal_pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest" />
          </div>
          {!isReceptionistProfile && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Duración de slot (minutos)</label>
            <select value={(data as any).slot_duration || 45}
              onChange={(e) => setData({ ...data, slot_duration: parseInt(e.target.value) } as any)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm">
              <option value="15">15 min</option>
              <option value="20">20 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min (2h)</option>
              <option value="180">180 min (3h)</option>
              <option value="240">240 min (4h)</option>
              <option value="360">360 min (6h)</option>
              <option value="480">480 min (8h)</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Intervalo entre citas disponibles en la agenda online</p>
          </div>
          )}
          {isReceptionistProfile && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre de encargado</label>
            <input type="text" value={(data as any).manager_name || ""}
              onChange={(e) => setData({ ...data, manager_name: e.target.value } as any)}
              placeholder="Ej: David"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <p className="text-[10px] text-gray-400 mt-1">Con este nombre se le saluda en Caja y Punto de Venta: &ldquo;Hola David&rdquo;</p>
          </div>
          )}
        </div>

        {/* Also attends clients toggle (for admins) */}
        {(data as any).role === "admin" || (data as any).role === "super_admin" ? (
          <div className="flex items-center justify-between p-3 bg-brand-blue/5 border border-brand-blue/20 rounded-xl">
            <div>
              <p className="text-sm font-medium text-brand-dark">También atiendo clientes</p>
              <p className="text-[10px] text-brand-gray">Activar para aparecer en el link de reserva online</p>
            </div>
            <button
              onClick={() => setData({ ...data, also_attends_clients: !(data as any).also_attends_clients } as any)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                (data as any).also_attends_clients ? "bg-brand-blue" : "bg-gray-300"
              }`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                (data as any).also_attends_clients ? "left-[22px]" : "left-0.5"
              }`} />
            </button>
          </div>
        ) : null}
      </div>

      {!isReceptionistProfile && (<>
      {/* Work mode selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Modalidad de Trabajo</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setData({ ...data, work_mode: "commission" })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              data.work_mode === "commission"
                ? "border-purple-500 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-bold text-gray-900">Comisión</p>
            <p className="text-xs text-gray-500 mt-1">Porcentaje por cada servicio realizado</p>
          </button>
          <button
            onClick={() => setData({ ...data, work_mode: "rental" })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              data.work_mode === "rental"
                ? "border-orange-500 bg-orange-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-bold text-gray-900">Arriendo</p>
            <p className="text-xs text-gray-500 mt-1">Monto fijo por día trabajado</p>
          </button>
        </div>
      </div>

      {/* Commission settings */}
      {data.work_mode === "commission" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Configuración Comisión</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Porcentaje de comisión (%)</label>
            <input type="number" min="0" max="100" value={data.commission_rate ?? ""}
              onChange={(e) => setData({ ...data, commission_rate: e.target.value === "" ? (null as any) : parseInt(e.target.value) })}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <p className="text-xs text-gray-400 mt-1">El profesional recibe este % de cada venta que realice</p>
          </div>
        </div>
      )}

      {/* Rental settings */}
      {data.work_mode === "rental" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Configuración Arriendo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor día ($)</label>
              <input type="number" min="0" step="1000" value={data.rental_daily_rate ?? ""}
                onChange={(e) => setData({ ...data, rental_daily_rate: e.target.value === "" ? (null as any) : parseInt(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Descuentos fijos (aseo, consumibles)</label>
              <input type="number" min="0" step="1000" value={data.rental_deductions ?? ""}
                onChange={(e) => setData({ ...data, rental_deductions: e.target.value === "" ? (null as any) : parseInt(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mínimo días/semana</label>
              <input type="number" min="1" max="7" value={data.rental_min_days ?? ""}
                onChange={(e) => setData({ ...data, rental_min_days: e.target.value === "" ? (null as any) : parseInt(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Máximo días/semana</label>
              <input type="number" min="1" max="7" value={data.rental_max_days ?? ""}
                onChange={(e) => setData({ ...data, rental_max_days: e.target.value === "" ? (null as any) : parseInt(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          {/* Cash handling: does this rental barber take their own cash, or does it stay
              in the salon till until settled against rent? Drives whether their cash
              sales count toward the salon's daily till and revenue. */}
          <label className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl cursor-pointer">
            <input type="checkbox" checked={!!(data as any).rental_cash_to_barber}
              onChange={(e) => setData({ ...data, rental_cash_to_barber: e.target.checked } as any)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
            <span className="text-sm text-gray-700">
              <span className="font-medium">El profesional se lleva su efectivo directamente</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Si esta activo, el efectivo de sus ventas NO se cuenta en la caja ni en los
                ingresos del salon (solo entra el arriendo). Dejalo desactivado si el efectivo
                queda en la caja y se descuenta del arriendo a fin de mes.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas / Observaciones</label>
            <textarea value={data.rental_notes || ""} rows={2}
              onChange={(e) => setData({ ...data, rental_notes: e.target.value })}
              placeholder="Ej: caso especial, acuerdo diferente..."
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {/* Preview calculation */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-xs text-orange-600 uppercase font-medium mb-2">Simulación mensual</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-600">Días trabajados (mes):</span>
              <span className="font-medium text-right">{(data.rental_min_days || 5) * 4} días</span>
              <span className="text-gray-600">Valor día:</span>
              <span className="font-medium text-right">{formatCurrency(data.rental_daily_rate || 0)}</span>
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium text-right">{formatCurrency((data.rental_min_days || 5) * 4 * (data.rental_daily_rate || 0))}</span>
              <span className="text-gray-600">Descuentos:</span>
              <span className="font-medium text-right text-red-600">-{formatCurrency(data.rental_deductions || 0)}</span>
              <span className="text-gray-900 font-bold border-t pt-1">Total a cobrar:</span>
              <span className="font-bold text-right text-orange-700 border-t pt-1">
                {formatCurrency((data.rental_min_days || 5) * 4 * (data.rental_daily_rate || 0) - (data.rental_deductions || 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Work Schedule */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Horario de Trabajo</h2>
        <p className="text-xs text-gray-400">Define dias y horas. Esto determina disponibilidad en la agenda online.</p>
        <BarberScheduleEditor barberId={params.id as string} showToast={showToast} />
      </div>

      {/* Services assignment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Servicios que ofrece</h2>
        <p className="text-xs text-gray-400">Selecciona que servicios realiza. Si no seleccionas ninguno, ofrece todos.</p>
        <BarberServicesEditor barberId={params.id as string} showToast={showToast} />
      </div>

      {/* Presentacion (visible en booking) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Presentacion (visible en booking)</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Instagram</label>
          <input type="text" value={(data as any).instagram || ""}
            onChange={(e) => setData({ ...data, instagram: e.target.value } as any)}
            placeholder="@usuario o link"
            className="w-full border rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bio / Descripcion corta</label>
          <textarea value={(data as any).bio || ""} rows={2}
            onChange={(e) => setData({ ...data, bio: e.target.value } as any)}
            placeholder="Ej: Especialista en uñas, colorimetría, degradados. 5 años de experiencia."
            className="w-full border rounded-xl px-3 py-2.5 text-sm" />
        </div>
        {/* Ocultos (Nico, 29-sep): Especialidades, Años de experiencia y Video intro.
            Los datos y el guardado siguen intactos; solo se quita el campo de la pantalla. */}
        <div className="hidden">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Especialidades (separar con coma)</label>
            <input type="text" value={(data as any).specialties?.join(", ") || ""}
              onChange={(e) => setData({ ...data, specialties: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) } as any)}
              placeholder="Ej: Uñas, Color, Degradado, Diseño"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Años experiencia</label>
              <input type="number" min="0" value={(data as any).years_experience || ""}
                onChange={(e) => setData({ ...data, years_experience: parseInt(e.target.value) || null } as any)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Video intro (URL)</label>
              <input type="url" value={(data as any).intro_video_url || ""}
                onChange={(e) => setData({ ...data, intro_video_url: e.target.value } as any)}
                placeholder="https://..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
        </div>
      </div>

      </>)}

      {/* Change Role */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Rol del Usuario</h2>
        <div className="flex items-center gap-3">
          <select
            value={data.role || "barber"}
            onChange={(e) => setData({ ...data, role: e.target.value as any })}
            className="border rounded-xl px-3 py-2.5 text-sm flex-1"
          >
            <option value="barber">Profesional</option>
            <option value="admin">Administrador</option>
            <option value="receptionist">Recepcionista</option>
          </select>
          <button
            onClick={async () => {
              const pin = prompt("PIN de admin (4 digitos):");
              if (!pin || pin.length !== 4) return;
              const res = await fetch(`/api/barberos/${params.id}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: data.role, pin }),
              });
              const result = await res.json();
              if (res.ok) {
                showToast(result.message || "Rol actualizado", "success");
              } else {
                showToast(result.error || "Error", "error");
              }
            }}
            className="px-4 py-2.5 bg-orange-600 text-white text-sm rounded-xl hover:bg-orange-700"
          >
            Cambiar Rol
          </button>
        </div>
        <p className="text-xs text-gray-400">Requiere PIN de administrador para confirmar el cambio.</p>
      </div>

      {/* Save */}
      <button onClick={save} disabled={saving}
        className="w-full py-3 bg-brand-blue text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]">
        {saving ? "Guardando..." : "Guardar Cambios"}
      </button>
    </div>
  );
}
