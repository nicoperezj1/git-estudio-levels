"use client";

import { BookingRuleCard } from "@/components/settings/booking-rule-card";
import { NotificationsCard } from "@/components/settings/notifications-card";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Copy, ExternalLink, Globe, Clock, Building2, Image as ImageIcon, Lock, Moon, Sun, MessageCircle, Mail, CalendarDays } from "lucide-react";
import { compressImage } from "@/lib/image-compress";

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

interface DaySchedule {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export default function ConfiguracionPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  // Reliable tenant source (server-provided, same pattern used everywhere else in the
  // app). The old code below re-resolved the tenant via a client-side auth.getUser()
  // call, which is the unreliable-on-Vercel pattern that made the booking link fall
  // back to the generic /booking URL for some accounts (e.g. recepcion).
  const { tenant, loading: tenantCtxLoading, switchTenant } = useTenant();
  const { isAtLeast } = useAuth();
  const isAdmin = isAtLeast("admin");

  const [businessData, setBusinessData] = useState({
    name: "",
    address: "",
    phone: "",
    website: "",
  });
  const [hours, setHours] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  // For a super_admin (no own tenant): let them pick which business to configure,
  // instead of failing with "No se pudo identificar el negocio".
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Change password (self-service, avoids the destructive "Enviar credenciales" flow)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Tema (Punto Nico, 25-sep): claro/oscuro por negocio, solo administrador. Se guarda
  // en la tabla tenants y se aplica al instante en toda la app via TenantProvider
  // (ver src/lib/tenant-context.tsx), asi que aca solo hace falta reflejar el valor
  // actual y avisarle al servidor cuando cambia.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [savingTheme, setSavingTheme] = useState(false);

  // Calendario "profesionales agrupados" (solo negocios de 2 a 4 profesionales). Lo lee y lo
  // guarda /api/settings/calendar-view; si el negocio no cumple el rango, la tarjeta no aparece.
  const [calView, setCalView] = useState<{ enabled: boolean; eligible: boolean; professionals: number } | null>(null);
  const [savingCalView, setSavingCalView] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/settings/calendar-view?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setCalView({ enabled: !!d?.enabled, eligible: !!d?.eligible, professionals: Number(d?.professionals) || 0 }))
      .catch(() => setCalView(null));
  }, [tenantId]);
  const handleCalViewToggle = async (next: boolean) => {
    if (!tenantId || savingCalView || !calView) return;
    setSavingCalView(true);
    try {
      const res = await fetch("/api/settings/calendar-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      setCalView({ ...calView, enabled: next });
      showToast(next ? "Vista de todos los profesionales activada" : "Vista de todos los profesionales desactivada", "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally {
      setSavingCalView(false);
    }
  };

  // Clientes por bloque (solo Kinesiologia): cuantos clientes atiende un profesional a la vez.
  const [cap, setCap] = useState<{ eligible: boolean; max: number; limit: number } | null>(null);
  const [savingCap, setSavingCap] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/settings/slot-capacity?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setCap({ eligible: !!d?.eligible, max: Number(d?.max) || 1, limit: Number(d?.limit) || 6 }))
      .catch(() => setCap(null));
  }, [tenantId]);
  const handleCapChange = async (next: number) => {
    if (!tenantId || savingCap || !cap) return;
    setSavingCap(true);
    try {
      const res = await fetch("/api/settings/slot-capacity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, max: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      setCap({ ...cap, max: next });
      showToast(next === 1 ? "Un cliente por bloque" : `Hasta ${next} clientes por bloque`, "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally {
      setSavingCap(false);
    }
  };

  // Caja y Standby (Fase 5): Standby nuevo (apagado por defecto) y tope de efectivo antes de pedir una reduccion.
  const [cajaSec, setCajaSec] = useState<{ standbyV2: boolean; cashCap: number | null; cajaLock?: boolean; migrationMissing?: boolean } | null>(null);
  const [capInput, setCapInput] = useState("");
  const [savingCajaSec, setSavingCajaSec] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/settings/caja-seguridad?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => { setCajaSec({ standbyV2: !!d?.standbyV2, cashCap: d?.cashCap ?? null, cajaLock: !!d?.cajaLock, migrationMissing: !!d?.migrationMissing }); setCapInput(d?.cashCap ? String(d.cashCap) : ""); })
      .catch(() => setCajaSec(null));
  }, [tenantId]);
  const saveCajaSec = async (patch: { standbyV2?: boolean; cashCap?: number | null; cajaLock?: boolean }, okMsg: string) => {
    if (!tenantId || savingCajaSec) return;
    setSavingCajaSec(true);
    try {
      const res = await fetch("/api/settings/caja-seguridad", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      setCajaSec((c) => (c ? { ...c, ...patch } : c));
      showToast(okMsg, "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally {
      setSavingCajaSec(false);
    }
  };

  // Libro de movimientos del profesional (Arriendo y Comision): interruptor por negocio, apagado por defecto.
  const [ledger, setLedger] = useState<{ enabled: boolean; migrationMissing: boolean } | null>(null);
  const [savingLedger, setSavingLedger] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/settings/pro-ledger?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setLedger({ enabled: !!d?.enabled, migrationMissing: !!d?.migrationMissing }))
      .catch(() => setLedger(null));
  }, [tenantId]);
  const handleLedgerToggle = async (next: boolean) => {
    if (!tenantId || savingLedger || !ledger) return;
    setSavingLedger(true);
    try {
      const res = await fetch("/api/settings/pro-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      setLedger({ ...ledger, enabled: next });
      showToast(next ? "Libro de movimientos activado" : "Libro de movimientos desactivado", "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally {
      setSavingLedger(false);
    }
  };

  // Correo al que llegan las solicitudes de insumos (vacio = el correo del administrador).
  const [supplyEmail, setSupplyEmail] = useState({ value: "", fallback: "", loaded: false, migrationMissing: false });
  const [savingSupplyEmail, setSavingSupplyEmail] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/settings/supply-email?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setSupplyEmail({ value: d?.email || "", fallback: d?.fallback || "", loaded: !d?.error, migrationMissing: !!d?.migrationMissing }))
      .catch(() => {});
  }, [tenantId]);
  const saveSupplyEmail = async () => {
    if (!tenantId || savingSupplyEmail) return;
    setSavingSupplyEmail(true);
    try {
      const res = await fetch("/api/settings/supply-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email: supplyEmail.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      showToast("Correo para solicitudes de insumos guardado", "success");
    } catch (e: any) {
      showToast(e?.message || "No se pudo guardar", "error");
    } finally {
      setSavingSupplyEmail(false);
    }
  };

  // Deposit/abono settings
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(30);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [depositMessage, setDepositMessage] = useState("Este servicio requiere un abono para confirmar tu cita.");
  const [depositSaving, setDepositSaving] = useState(false);

  // Cupo de mensajeria (Nico, 27-sep: "sistema de tokens... similar a la opcion que tiene
  // Claude"). Solo lectura aca: se calcula del lado del servidor (GET /api/message-quota)
  // cada vez que las rutas de envio consumen cupo; esta seccion solo muestra el estado.
  interface QuotaStatus { channel: "whatsapp" | "email"; limit: number | null; used: number; remaining: number | null; cycleStart: string }
  const [quota, setQuota] = useState<{ whatsapp: QuotaStatus | null; email: QuotaStatus | null } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [requestingQuota, setRequestingQuota] = useState<"whatsapp" | "email" | null>(null);

  // Generate time options from 06:00 to 23:00
  const timeOptions: string[] = [];
  for (let h = 6; h <= 23; h++) {
    timeOptions.push(`${h.toString().padStart(2, "0")}:00`);
    timeOptions.push(`${h.toString().padStart(2, "0")}:30`);
  }

  useEffect(() => {
    if (tenantCtxLoading) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantCtxLoading, tenant?.id]);

  // Resolve the tenant on demand: server-provided context first, then the super_admin's
  // manual override (localStorage), then the user's own profile. Used by fetchData AND
  // by uploadLogo/save, so those actions never depend on a `tenantId` state that might
  // not have flushed yet — that stale-null was why the logo upload kept answering
  // "espera a que cargue la pagina" even after loading.
  const resolveTenantId = async (): Promise<string | null> => {
    let id = tenant?.id || null;
    if (!id) {
      try {
        const stored = localStorage.getItem("tenant_override");
        if (stored) id = JSON.parse(stored).tenantId || null;
      } catch {}
    }
    if (!id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Wrapped defensively: this lookup was returning 500 (recursive RLS on
        // profiles, fixed in migration 060). A failure here must not crash the page.
        try {
          const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
          id = profile?.tenant_id || null;
        } catch {
          id = null;
        }
      }
    }
    if (id && id !== tenantId) setTenantId(id);
    return id;
  };

  const fetchData = async () => {
    setLoading(true);

    const resolvedTenantId = await resolveTenantId();

    // No business resolved (typical for a super_admin, whose account isn't tied to one).
    // Offer a picker instead of failing every action with "No se pudo identificar".
    if (!resolvedTenantId) {
      try {
        const res = await fetch("/api/superadmin/tenants");
        const list = await res.json();
        if (Array.isArray(list)) setAvailableTenants(list.map((t: any) => ({ id: t.id, name: t.name })));
      } catch {}
      setLoading(false);
      return;
    }

    if (resolvedTenantId) {
      setTenantId(resolvedTenantId);
      const currentTenantId = resolvedTenantId;
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("name, slug, address, phone, logo_url, website, theme")
        .eq("id", resolvedTenantId)
        .single();

      if (tenantRow) {
        setBusinessData({
          name: tenantRow.name || "",
          address: tenantRow.address || "",
          phone: tenantRow.phone || "",
          website: (tenantRow as any).website || "",
        });
        setTenantSlug(tenantRow.slug || null);
        setLogoUrl((tenantRow as any).logo_url || null);
        setTheme(((tenantRow as any).theme as "light" | "dark") || "light");
      }

      {
        // Fetch deposit settings
        const depRes = await fetch(`/api/settings/deposit?tenantId=${resolvedTenantId}`);
        const depData = await depRes.json();
        if (depData) {
          setDepositEnabled(depData.deposit_enabled || false);
          setDepositPercentage(depData.deposit_percentage || 30);
          setCancellationHours(depData.cancellation_free_hours || 24);
          setDepositMessage(depData.deposit_message || "Este servicio requiere un abono para confirmar tu cita.");
        }
      }
    }

    // Fetch business hours for this tenant (use the resolved value directly, not the
    // tenantId state — setState above may not have flushed yet within this function).
    const hoursFilter = resolvedTenantId || null;
    let hoursQuery = supabase
      .from("business_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .order("day_of_week");
    if (hoursFilter) hoursQuery = hoursQuery.eq("tenant_id", hoursFilter);
    const { data: hoursData } = await hoursQuery;

    if (hoursData && hoursData.length > 0) {
      setHours(hoursData.map((h) => ({
        day_of_week: h.day_of_week,
        open_time: h.open_time?.slice(0, 5) || "10:00",
        close_time: h.close_time?.slice(0, 5) || "21:00",
        is_closed: h.is_closed || false,
      })));
    } else {
      // Default
      setHours(dayNames.map((_, i) => ({
        day_of_week: i,
        open_time: "10:00",
        close_time: "21:00",
        is_closed: i === 0,
      })));
    }

    setLoading(false);
  };

  const updateDay = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setHours((prev) =>
      prev.map((h) => h.day_of_week === dayIndex ? { ...h, [field]: value } : h)
    );
  };

  const handleSave = async () => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    setSaving(true);
    // Save through the server (admin client) instead of the browser Supabase client,
    // which hung silently on Vercel and left this button stuck on "Guardando...".
    try {
      const res = await fetch("/api/settings/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          business: {
            name: businessData.name,
            address: businessData.address,
            phone: businessData.phone,
            website: businessData.website,
          },
          hours,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        showToast("Configuracion guardada", "success");
      } else {
        showToast(result.error || "No se pudo guardar", "error");
      }
    } catch {
      showToast("No se pudo guardar. Revisa tu conexion.", "error");
    } finally {
      setSaving(false);
    }
  };

  const bookingUrl = typeof window !== "undefined"
    ? tenantSlug
      ? `${window.location.origin}/b/${tenantSlug}`
      : `${window.location.origin}/booking`
    : "re-booking.cl/booking";

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    showToast("Link copiado!", "success");
  };

  const handleThemeChange = async (next: "light" | "dark") => {
    if (!tenantId || savingTheme || next === theme) return;
    const previous = theme;
    setTheme(next); // optimista: TenantProvider aplica document.documentElement.classList al instante
    setSavingTheme(true);
    try {
      const res = await fetch("/api/settings/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, theme: next }),
      });
      if (!res.ok) throw new Error();
      showToast(next === "dark" ? "Tema oscuro activado" : "Tema claro activado", "success");
      // TenantProvider (arriba, en el layout) es quien aplica document.documentElement.dark
      // en base al tema del tenant que ya tiene cargado; recargamos para que vuelva a
      // pedir /api/tenant/info y el cambio se refleje en TODA la app (sidebar incluido),
      // no solo en esta pagina.
      setTimeout(() => window.location.reload(), 400);
    } catch {
      setTheme(previous);
      showToast("No se pudo cambiar el tema", "error");
    } finally {
      setSavingTheme(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    setQuotaLoading(true);
    fetch(`/api/message-quota?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => setQuota(data.whatsapp !== undefined ? data : null))
      .catch(() => setQuota(null))
      .finally(() => setQuotaLoading(false));
  }, [tenantId]);

  const requestMoreQuota = async (channel: "whatsapp" | "email") => {
    if (!tenantId || requestingQuota) return;
    setRequestingQuota(channel);
    try {
      const res = await fetch(`/api/message-quota/request?tenantId=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) throw new Error();
      showToast("Solicitud enviada. Te contactaremos a la brevedad.", "success");
    } catch {
      showToast("No se pudo enviar la solicitud. Intenta de nuevo.", "error");
    } finally {
      setRequestingQuota(null);
    }
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original) return;
    if (!original.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(original.name)) {
      showToast("El archivo debe ser una imagen (JPG, PNG, WEBP)", "error");
      e.target.value = "";
      return;
    }
    // Resolve the tenant right now instead of trusting the (possibly-null) state, which
    // was the real cause of the logo upload staying stuck on "espera a que cargue".
    const activeTenantId = await resolveTenantId();
    if (!activeTenantId) {
      showToast("No se pudo identificar el negocio. Recarga la pagina e intenta de nuevo.", "error");
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    // Compress large photos in the browser (and normalize JPG/PNG/WEBP) so the upload
    // is always a small, valid image instead of failing on a heavy or odd-format file.
    let file: File;
    try {
      file = await compressImage(original, { maxBytes: 5 * 1024 * 1024 });
    } catch (err: any) {
      showToast(err.message || "No se pudo procesar la imagen", "error");
      setUploadingLogo(false);
      e.target.value = "";
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("tenantId", activeTenantId);
    try {
      const res = await fetch("/api/settings/logo", { method: "POST", body: form });
      const result = await res.json();
      if (res.ok) {
        setLogoUrl(result.url);
        showToast("Logo actualizado", "success");
      } else {
        showToast(result.error || "Error al subir logo", "error");
      }
    } catch {
      showToast("Error al subir logo", "error");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const removeLogo = async () => {
    if (!tenantId) return;
    await fetch(`/api/settings/logo?tenantId=${tenantId}`, { method: "DELETE" });
    setLogoUrl(null);
    showToast("Logo eliminado", "success");
  };

  const handleChangePassword = async () => {
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Completa los 3 campos");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contraseñas nuevas no coinciden");
      return;
    }

    setChangingPassword(true);

    // Verify the current password by re-authenticating (updateUser alone would accept
    // any new password without checking the current one, since the session is already
    // active — we need this extra check so a stranger at an unlocked computer can't
    // just change the password without knowing it).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setPasswordError("No se pudo verificar tu sesion. Vuelve a iniciar sesion.");
      setChangingPassword(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordError("La contraseña actual no es correcta");
      setChangingPassword(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    setChangingPassword(false);

    if (updateError) {
      setPasswordError(updateError.message || "Error al cambiar la contraseña");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    showToast("Contraseña actualizada", "success");
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin" />
      </div>
    );
  }

  // No business active (super_admin without a selected tenant). Ask which one to
  // configure instead of showing forms that can't identify the business.
  if (!tenantId) {
    return (
      <div className="p-3 md:p-6 space-y-3 md:space-y-4 animate-fade-in max-w-3xl">
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Configuracion</h1>
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-brand-dark">Elige el negocio</h2>
            <p className="text-xs text-brand-gray">Tu cuenta administra varios negocios. Selecciona cual quieres configurar.</p>
          </div>
          {availableTenants.length > 0 ? (
            <div className="space-y-2">
              {availableTenants.map((t) => (
                <button key={t.id} onClick={() => switchTenant(t.id, t.name)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-brand-blue hover:bg-brand-blue/5 transition-colors text-left">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue font-bold text-xs flex-shrink-0">
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm font-medium text-brand-dark truncate">{t.name}</span>
                  <span className="text-xs text-brand-blue font-medium">Configurar →</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-brand-gray">No se pudieron cargar los negocios</p>
              <p className="text-[10px] text-brand-gray mt-1">Recarga la pagina o entra a un negocio desde Empresas</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in max-w-3xl">
      <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Configuracion</h1>

      {/* Preferencias de reservas: banner, logo, Google Maps y tipo de vista */}
      {isAdmin && (
        <a href="/dashboard/configuracion/reservas" className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-brand-white p-4 shadow-sm transition-colors hover:border-brand-blue/40">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"><ImageIcon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-brand-dark">Preferencias de reservas</p>
            <p className="text-xs text-brand-gray">Logo, imagen del negocio, Google Maps y cómo ven tus clientes la reserva</p>
          </div>
          <span className="text-xs font-semibold text-brand-blue">Abrir →</span>
        </a>
      )}

      {/* Booking Link */}
      <div className="bg-gradient-to-r from-brand-blue/5 to-brand-accent/5 rounded-2xl border border-brand-blue/20 p-4 md:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-blue" />
          <h2 className="font-bold text-brand-dark">Link de Reserva Online</h2>
        </div>
        <p className="text-sm text-brand-gray">
          Comparte este link para que tus clientes agenden directamente. Aparecen todos los profesionales disponibles.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white dark:bg-brand-white border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-brand-dark truncate">
            {bookingUrl}
          </div>
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-brand-blue/90 transition-colors">
            <Copy className="w-4 h-4" />
            Copiar
          </button>
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
            className="p-2.5 bg-white dark:bg-brand-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            <ExternalLink className="w-4 h-4 text-brand-gray" />
          </a>
        </div>
        <p className="text-xs text-brand-gray">
          Cada profesional tambien tiene su link personal en su perfil (seccion Profesionales).
        </p>
      </div>

      {/* Business Data */}
      <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-brand-gray" />
          <h2 className="font-bold text-brand-dark">Datos del Negocio</h2>
        </div>

        {/* Logo del negocio: se muestra en la reserva online y en las boletas por correo
            en vez del logo generico de re-booking. */}
        <div className="flex items-center gap-4">
          <label className="relative group cursor-pointer flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo del negocio" className="w-16 h-16 rounded-xl object-contain border border-gray-200 dark:border-white/10 bg-white" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-brand-light/40 border border-dashed border-gray-300 dark:border-white/10 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-gray-300" />
              </div>
            )}
            <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            {uploadingLogo && (
              <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                <span className="text-[8px] text-white font-medium text-center">Subiendo...</span>
              </div>
            )}
            <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" disabled={uploadingLogo} />
          </label>
          <div>
            <p className="text-sm font-medium text-brand-dark">Logo del negocio</p>
            <p className="text-xs text-brand-gray">Toca la imagen para subir tu logo. Se mostrara en la reserva online y en las boletas por correo.</p>
            {logoUrl && (
              <button onClick={removeLogo} className="text-xs text-red-500 hover:underline mt-1">Quitar logo</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Nombre</label>
            <input type="text" value={businessData.name}
              onChange={(e) => setBusinessData({ ...businessData, name: e.target.value })}
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Telefono</label>
            <input type="text" value={businessData.phone}
              onChange={(e) => setBusinessData({ ...businessData, phone: e.target.value })}
              placeholder="+56 9 1234 5678"
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-brand-gray mb-1">Direccion</label>
            <input type="text" value={businessData.address}
              onChange={(e) => setBusinessData({ ...businessData, address: e.target.value })}
              placeholder="Ej: Av. Principal 123, Comuna"
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-brand-gray mb-1">Sitio Web</label>
            <input type="text" value={businessData.website}
              onChange={(e) => setBusinessData({ ...businessData, website: e.target.value })}
              placeholder="https://www.minegocio.cl"
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>
      </div>

      {/* Per-day Schedule */}
      <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand-gray" />
          <div>
            <h2 className="font-bold text-brand-dark">Horario del Negocio</h2>
            <p className="text-xs text-brand-gray">Configura el horario de apertura y cierre por cada dia de la semana</p>
          </div>
        </div>

        <div className="space-y-2">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[140px_1fr_1fr_80px] gap-3 px-3 py-1">
            <span className="text-xs font-medium text-brand-gray">Dia</span>
            <span className="text-xs font-medium text-brand-gray">Apertura</span>
            <span className="text-xs font-medium text-brand-gray">Cierre</span>
            <span className="text-xs font-medium text-brand-gray text-center">Estado</span>
          </div>

          {/* Reorder: Monday first (1,2,3,4,5,6,0) */}
          {[1, 2, 3, 4, 5, 6, 0].map((dayIndex) => {
            const day = hours.find((h) => h.day_of_week === dayIndex);
            if (!day) return null;
            return (
              <div key={dayIndex}
                className={`grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_80px] gap-2 md:gap-3 items-center p-3 rounded-xl border transition-colors ${
                  day.is_closed ? "bg-gray-50 dark:bg-brand-light/20 border-gray-100 dark:border-white/10 opacity-60" : "bg-white dark:bg-brand-white border-gray-200 dark:border-white/10"
                }`}>
                {/* Day name */}
                <div className="flex items-center justify-between md:justify-start">
                  <span className={`text-sm font-medium ${day.is_closed ? "text-brand-gray" : "text-brand-dark"}`}>
                    {dayNames[dayIndex]}
                  </span>
                  {/* Mobile toggle */}
                  <button onClick={() => updateDay(dayIndex, "is_closed", !day.is_closed)}
                    className="md:hidden text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-white/10">
                    {day.is_closed ? "Cerrado" : "Abierto"}
                  </button>
                </div>

                {/* Open time */}
                <select value={day.open_time}
                  disabled={day.is_closed}
                  onChange={(e) => updateDay(dayIndex, "open_time", e.target.value)}
                  className="border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-lg px-2 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Close time */}
                <select value={day.close_time}
                  disabled={day.is_closed}
                  onChange={(e) => updateDay(dayIndex, "close_time", e.target.value)}
                  className="border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-lg px-2 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Desktop toggle */}
                <div className="hidden md:flex justify-center">
                  <button onClick={() => updateDay(dayIndex, "is_closed", !day.is_closed)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      day.is_closed ? "bg-gray-300" : "bg-brand-blue"
                    }`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      day.is_closed ? "left-0.5" : "left-[22px]"
                    }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-brand-gray">
          Los profesionales pueden tener horarios propios que sobreescriben este horario general (configurable en cada perfil).
        </p>
      </div>

      {/* Deposit / Abono Config
          (Configuracion de terminales de cobro con tarjeta: ver /dashboard/terminal-pos.
          Antes vivia aqui duplicado con otra pagina vieja separada, se unifico todo alla.) */}
      {/* Oculto por ahora (Nico, 29-sep): se quita "Abono para Reservas" de la pantalla; la logica queda intacta por si se reactiva. */}
      <div className="hidden bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <div>
              <h2 className="font-bold text-brand-dark">Abono para Reservas</h2>
              <p className="text-xs text-brand-gray">Cobra un anticipo al momento de agendar para reducir cancelaciones</p>
            </div>
          </div>
          <button
            onClick={() => setDepositEnabled(!depositEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${depositEnabled ? "bg-green-500" : "bg-gray-300"}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${depositEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>

        {depositEnabled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Porcentaje de abono</label>
                <select value={depositPercentage} onChange={(e) => setDepositPercentage(parseInt(e.target.value))}
                  className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm">
                  <option value={20}>20%</option>
                  <option value={30}>30%</option>
                  <option value={40}>40%</option>
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={100}>100% (pago completo)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Cancelacion gratis hasta</label>
                <select value={cancellationHours} onChange={(e) => setCancellationHours(parseInt(e.target.value))}
                  className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm">
                  <option value={2}>2 horas antes</option>
                  <option value={6}>6 horas antes</option>
                  <option value={12}>12 horas antes</option>
                  <option value={24}>24 horas antes</option>
                  <option value={48}>48 horas antes</option>
                  <option value={72}>72 horas antes</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-gray mb-1">Mensaje al cliente</label>
              <input type="text" value={depositMessage} onChange={(e) => setDepositMessage(e.target.value)}
                className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm"
                placeholder="Este servicio requiere un abono para confirmar tu cita." />
            </div>

            <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-3">
              <p className="text-xs text-green-700 dark:text-green-400">
                <strong>Ejemplo:</strong> Si un servicio cuesta $35.000 y el abono es 30%, la clienta paga $10.500 al agendar.
                Si cancela antes de {cancellationHours}h, se le devuelve. Despues de ese plazo, pierde el abono.
              </p>
            </div>

            <button
              onClick={async () => {
                if (!tenantId) return;
                setDepositSaving(true);
                await fetch("/api/settings/deposit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenantId,
                    deposit_enabled: depositEnabled,
                    deposit_percentage: depositPercentage,
                    cancellation_free_hours: cancellationHours,
                    deposit_message: depositMessage,
                  }),
                });
                setDepositSaving(false);
                showToast("Configuracion de abono guardada", "success");
              }}
              disabled={depositSaving}
              className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {depositSaving ? "Guardando..." : "Guardar Abono"}
            </button>
          </div>
        )}
      </div>

      {/* Cupo de mensajeria (Nico, 27-sep): barra de uso tipo "limites de Claude" para
          WhatsApp y correo. Visible para todo el que entra a Configuracion (afecta el dia
          a dia de todo el equipo), pero "Comprar mas" solo tiene sentido para quien decide
          el plan del negocio. */}
      {!quotaLoading && quota && (quota.whatsapp || quota.email) && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-5">
          <div>
            <h2 className="font-bold text-brand-dark">Cupo de Mensajeria</h2>
            <p className="text-xs text-brand-gray">Cuantos WhatsApp y correos de confirmacion, recordatorio y retencion te quedan este ciclo</p>
          </div>

          {([
            { channel: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, status: quota.whatsapp, barColor: "bg-green-500" },
            { channel: "email" as const, label: "Correos", icon: Mail, status: quota.email, barColor: "bg-brand-blue" },
          ]).map(({ channel, label, icon: Icon, status, barColor }) => {
            if (!status) return null;
            const unlimited = status.limit === null;
            const pct = unlimited ? 0 : Math.min(100, Math.round((status.used / Math.max(status.limit!, 1)) * 100));
            const exhausted = !unlimited && (status.remaining ?? 0) <= 0;
            const low = !unlimited && !exhausted && (status.remaining ?? 0) <= Math.max(1, Math.round((status.limit || 0) * 0.1));
            return (
              <div key={channel} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-brand-dark font-medium">
                    <Icon className="w-4 h-4 text-brand-gray" />
                    {label}
                  </div>
                  <span className="text-xs text-brand-gray">
                    {unlimited ? "Ilimitado" : `${status.used} / ${status.limit} usados`}
                  </span>
                </div>
                {!unlimited && (
                  <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${exhausted ? "bg-red-500" : low ? "bg-amber-500" : barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {exhausted && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                    <span>Ups, agotaste tu cupo de {label.toLowerCase()} de este mes. Los envios estan pausados hasta el proximo ciclo.</span>
                    {isAdmin && (
                      <button
                        onClick={() => requestMoreQuota(channel)}
                        disabled={requestingQuota === channel}
                        className="shrink-0 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {requestingQuota === channel ? "Enviando..." : "Comprar mas tokens"}
                      </button>
                    )}
                  </p>
                )}
                {!exhausted && low && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                    <span>Te quedan pocos {label.toLowerCase()} este mes ({status.remaining} restantes).</span>
                    {isAdmin && (
                      <button
                        onClick={() => requestMoreQuota(channel)}
                        disabled={requestingQuota === channel}
                        className="shrink-0 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
                      >
                        {requestingQuota === channel ? "Enviando..." : "Comprar mas tokens"}
                      </button>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Calendario: vista de varios dias para TODOS los profesionales. Solo administrador y solo
          si el negocio tiene entre 2 y 4 profesionales (con mas, la vista se veria recargada). */}
      {isAdmin && calView?.eligible && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-gray" />
            <div>
              <h2 className="font-bold text-brand-dark">Calendario</h2>
              <p className="text-xs text-brand-gray">Disponible para negocios de 2 a 4 profesionales (el tuyo tiene {calView.professionals})</p>
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={calView.enabled}
              disabled={savingCalView}
              onChange={(e) => handleCalViewToggle(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300"
            />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Vista profesionales agrupados por semana</span>
              <span className="block text-xs text-brand-gray">
                En el Calendario, los botones 1 / 3 / 7 días se pueden usar con todos los profesionales a la vez (cada uno con sus días juntos), no solo con uno.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Preferencias de reserva (Fase 6): regla de "Primer profesional disponible". Solo administrador. */}
      {isAdmin && <BookingRuleCard />}

      {/* Avisos y notificaciones (centro de avisos). Solo administrador. */}
      {isAdmin && <NotificationsCard />}

      {/* Caja y Standby (Fase 5). Solo administrador. */}
      {isAdmin && cajaSec && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-brand-dark">Caja y Standby</h2>
            <p className="text-xs text-brand-gray">Standby con servicios y productos, y aviso para llevar el efectivo a la caja fuerte</p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={cajaSec.standbyV2} disabled={savingCajaSec}
              onChange={(e) => saveCajaSec({ standbyV2: e.target.checked }, e.target.checked ? "Standby nuevo activado" : "Standby de siempre activado")}
              className="mt-1 h-4 w-4 rounded border-gray-300" />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Standby nuevo</span>
              <span className="block text-xs text-brand-gray">Saluda al profesional y le muestra sus servicios y los productos de venta. Si lo apagas, vuelve el Standby de siempre.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={!!cajaSec.cajaLock} disabled={savingCajaSec}
              onChange={(e) => saveCajaSec({ cajaLock: e.target.checked }, e.target.checked ? "Apagar caja con PIN activado" : "Apagar caja con PIN desactivado")}
              className="mt-1 h-4 w-4 rounded border-gray-300" />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Apagar y encender la caja con PIN</span>
              <span className="block text-xs text-brand-gray">La Caja y el Punto de Venta se pueden apagar (se oculta todo) y solo se encienden con el PIN de recepción o del administrador. Si lo desactivas, no aparece el botón "Apagar caja".</span>
            </span>
          </label>
          <div>
            <label className="block text-sm font-medium text-brand-dark mb-1">Tope de efectivo en caja</label>
            <div className="flex gap-2">
              <input type="number" min={0} value={capInput} onChange={(e) => setCapInput(e.target.value)} placeholder="Sin tope"
                className="w-44 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <button type="button" disabled={savingCajaSec}
                onClick={() => saveCajaSec({ cashCap: capInput.trim() === "" ? null : Number(capInput) }, capInput.trim() === "" ? "Sin tope de efectivo" : "Tope guardado")}
                className="px-4 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium disabled:opacity-50">Guardar</button>
            </div>
            <p className="text-xs text-brand-gray mt-1">Cuando el efectivo pase este monto, se le pedirá a quien esté en caja llevar el excedente a la caja fuerte. Vacío = sin aviso.</p>
          </div>
          {cajaSec.migrationMissing && <p className="text-xs text-red-500">Falta aplicar la migración 094 en la base de datos.</p>}
        </div>
      )}

      {/* Clientes por bloque: solo administrador y solo negocios de Kinesiologia. */}
      {isAdmin && cap?.eligible && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-3">
          <div>
            <h2 className="font-bold text-brand-dark">Clientes por bloque</h2>
            <p className="text-xs text-brand-gray">Cuántos clientes puede atender un profesional a la vez en el mismo horario</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: cap.limit }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={savingCap}
                onClick={() => handleCapChange(n)}
                className={`w-10 h-10 rounded-xl text-sm font-semibold border transition-colors ${
                  cap.max === n ? "bg-brand-blue text-white border-brand-blue" : "border-gray-200 text-brand-dark hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-brand-gray">
            {cap.max === 1 ? "Un cliente por horario (lo normal)." : `Cada horario admite hasta ${cap.max} clientes. En el link de reserva se muestra cuántos cupos quedan.`}
          </p>
        </div>
      )}

      {/* Solicitud de insumos: a que correo llega. Solo administrador. */}
      {isAdmin && supplyEmail.loaded && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-3">
          <div>
            <h2 className="font-bold text-brand-dark">Solicitud de insumos</h2>
            <p className="text-xs text-brand-gray">Correo al que le llega a quien administra lo que recepción pide comprar</p>
          </div>
          {supplyEmail.migrationMissing ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">Falta una actualización de la base de datos (migración 092) para poder elegir el correo.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={supplyEmail.value}
                onChange={(e) => setSupplyEmail({ ...supplyEmail, value: e.target.value })}
                placeholder={supplyEmail.fallback || "correo@ejemplo.com"}
                className="w-full max-w-sm rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <button
                onClick={saveSupplyEmail}
                disabled={savingSupplyEmail}
                className="rounded-xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingSupplyEmail ? "Guardando…" : "Guardar"}
              </button>
              <p className="w-full text-[11px] text-brand-gray">Si lo dejas vacío, se usa el correo del administrador{supplyEmail.fallback ? ` (${supplyEmail.fallback})` : ""}.</p>
            </div>
          )}
        </div>
      )}

      {/* Libro de movimientos del profesional (Arriendo y Comision). Solo administrador. */}
      {isAdmin && ledger && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-3">
          <div>
            <h2 className="font-bold text-brand-dark">Arriendo y Comisión</h2>
            <p className="text-xs text-brand-gray">Cómo se calcula lo que se le paga o cobra a cada profesional</p>
          </div>
          {ledger.migrationMissing ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">Falta una actualización de la base de datos (migración 091) para poder activarlo.</p>
          ) : (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ledger.enabled}
                disabled={savingLedger}
                onChange={(e) => handleLedgerToggle(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                <span className="block text-sm font-medium text-brand-dark">Usar el libro de movimientos</span>
                <span className="block text-xs text-brand-gray">
                  Suma y resta propinas, comisión por productos, consumibles, dinero a favor, descuentos y movimientos manuales con una misma regla. Apagado, Arriendo y Comisiones calculan como siempre.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      {/* Tema (Punto Nico, 25-sep): solo Administrador — a diferencia del resto de esta
          pagina (admin + recepcion), el tema es de todo el negocio: lo elige el admin y
          lo ven todos los que trabajan ahi, asi que se restringe a admin/super_admin. */}
      {isAdmin && (
        <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-5 h-5 text-brand-gray" /> : <Sun className="w-5 h-5 text-brand-gray" />}
            <div>
              <h2 className="font-bold text-brand-dark">Tema del Negocio</h2>
              <p className="text-xs text-brand-gray">Elige como se ve re-booking para todo tu equipo (claro u oscuro)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              disabled={savingTheme}
              className={`flex items-center gap-2 justify-center rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                theme === "light"
                  ? "border-brand-blue bg-brand-blue/5 text-brand-blue"
                  : "border-gray-200 dark:border-white/10 text-brand-gray hover:border-gray-300 dark:hover:border-white/20"
              }`}
            >
              <Sun className="w-4 h-4" />
              Claro
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              disabled={savingTheme}
              className={`flex items-center gap-2 justify-center rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                theme === "dark"
                  ? "border-brand-blue bg-brand-blue/5 text-brand-blue"
                  : "border-gray-200 dark:border-white/10 text-brand-gray hover:border-gray-300 dark:hover:border-white/20"
              }`}
            >
              <Moon className="w-4 h-4" />
              Oscuro
            </button>
          </div>
          <p className="text-xs text-brand-gray">
            Este cambio aplica a todo el sistema para {businessData.name || "tu negocio"}: colores, tarjetas y el logo de re-booking se adaptan automaticamente.
          </p>
          {/* Aviso "tema oscuro parcial" retirado (Nico, 29-sep): la cobertura ya es completa. */}
        </div>
      )}

      {/* Privacidad: cambiar contraseña */}
      <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-brand-gray" />
          <div>
            <h2 className="font-bold text-brand-dark">Privacidad</h2>
            <p className="text-xs text-brand-gray">Cambia tu contraseña sin depender de un administrador</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Contraseña actual</label>
            <input type="password" value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Nueva contraseña</label>
            <input type="password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Confirmar nueva contraseña</label>
            <input type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-brand-light/40 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>

        {passwordError && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{passwordError}</p>}

        <button onClick={handleChangePassword} disabled={changingPassword}
          // bg-gray-900 fijo (no brand-dark): brand-dark se invierte a casi-blanco en tema
          // oscuro (se usa para texto de alto contraste), asi que de fondo aca dejaria el
          // boton blanco sobre blanco.
          className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
          {changingPassword ? "Cambiando..." : "Cambiar contraseña"}
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-8 py-3 bg-brand-blue text-white rounded-xl font-medium hover:bg-brand-blue/90 transition-colors disabled:opacity-50 shadow-sm">
          {saving ? "Guardando..." : "Guardar Configuracion"}
        </button>
      </div>
    </div>
  );
}
