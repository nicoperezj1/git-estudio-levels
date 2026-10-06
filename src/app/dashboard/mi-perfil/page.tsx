"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Copy, Camera, Sun, Moon, Monitor } from "lucide-react";

export default function MiPerfilPage() {
  const { user } = useAuth();
  const { tenant, userTheme, setUserTheme } = useTenant();
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  // Tema propio: claro, oscuro o "igual que el negocio" (null). Se aplica al instante
  // desde TenantProvider y se guarda en el perfil del usuario.
  const changeTheme = async (next: "light" | "dark" | null) => {
    if (savingTheme || next === userTheme) return;
    const previous = userTheme;
    setUserTheme(next);
    setSavingTheme(true);
    try {
      const res = await fetch("/api/profile/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      if (!res.ok) throw new Error();
      showToast("Tema guardado", "success");
    } catch {
      setUserTheme(previous);
      showToast("No se pudo cambiar el tema", "error");
    } finally {
      setSavingTheme(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/barberos/${user.id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.id]);

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadingAvatar(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/barberos/${user.id}/avatar`, { method: "POST", body: form });
      if (res.ok) {
        const result = await res.json();
        setData((prev: any) => ({ ...prev, avatar_url: result.url }));
        showToast("Foto actualizada", "success");
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

  const handleSave = async () => {
    if (!user?.id || !data) return;
    setSaving(true);
    await fetch(`/api/barberos/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio: data.bio,
        specialties: data.specialties,
        phone: data.phone,
        intro_video_url: data.intro_video_url,
      }),
    });
    setSaving(false);
    showToast("Perfil actualizado", "success");
  };

  if (loading) return <Spinner />;
  if (!data) return <p className="p-6 text-brand-gray">No se pudo cargar tu perfil.</p>;

  // Short readable personal link: /b/<tenant>/<barber-slug>. Falls back to the
  // Short, readable personal link: /<tenant-slug>/<barber-slug>
  //   e.g. re-booking.cl/estudiolevels/javier-garcia
  // Needs both the tenant slug and the barber's booking_slug. If either isn't ready,
  // fall back to /pro/<barberId> (longer but resolves the right barber directly), and
  // finally to a plain /booking link. All paths open THIS professional — never "any
  // available barber".
  const origin = typeof window !== "undefined" ? window.location.origin : "https://re-booking.cl";
  const barberId = data.id || user?.id || "";
  const barberSlug = data.booking_slug as string | undefined;
  const tenantSlug = (data as any).tenant_slug || tenant?.slug;
  const bookingLink = barberSlug && tenantSlug
    ? `${origin}/${tenantSlug}/${barberSlug}`
    : barberId
    ? `${origin}/pro/${barberId}`
    : `${origin}/booking${tenantSlug ? `?tenant=${tenantSlug}` : ""}`;

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-3 md:space-y-6 animate-fade-in">
      <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Mi Perfil</h1>

      {/* Basic info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-4">
          <label className="relative group cursor-pointer flex-shrink-0">
            {data.avatar_url ? (
              <img src={data.avatar_url} alt={data.name} className="w-16 h-16 rounded-full object-cover border-2 border-brand-blue/20" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand-blue/10 flex items-center justify-center text-xl font-bold text-brand-blue">
                {data.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="text-[9px] text-white font-medium">Subiendo...</span>
              </div>
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" disabled={uploadingAvatar} />
          </label>
          <div>
            <h2 className="text-lg font-bold text-brand-dark">{data.name}</h2>
            <p className="text-sm text-brand-gray">{data.email}</p>
            <p className="text-[11px] text-brand-gray mt-0.5">Toca la foto para cambiarla</p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-brand-gray mb-1">Teléfono</label>
          <input type="text" value={data.phone || ""}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            placeholder="+56 9 1234 5678"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs text-brand-gray mb-1">Biografía</label>
          <textarea value={data.bio || ""} rows={3}
            onChange={(e) => setData({ ...data, bio: e.target.value })}
            placeholder="Cuéntale a tus clientes sobre ti..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>

        {/* Oculto (Nico, 29-sep): Especialidades. Los datos siguen intactos. */}
        <div className="hidden">
          <label className="block text-xs text-brand-gray mb-1">Especialidades</label>
          <input type="text" value={data.specialties?.join(", ") || ""}
            onChange={(e) => setData({ ...data, specialties: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="Ej: Degradado, Color, Uñas"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs text-brand-gray mb-1">Instagram</label>
          <input type="text" value={data.intro_video_url || ""}
            onChange={(e) => setData({ ...data, intro_video_url: e.target.value })}
            placeholder="@tu_instagram"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* Mi tema: cada usuario elige el suyo; "Igual que el negocio" usa el del administrador. */}
      <div className="bg-white dark:bg-brand-white rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-5 space-y-3">
        <h3 className="font-bold text-brand-dark">Mi tema</h3>
        <p className="text-xs text-brand-gray">Elige como ves re-booking. No cambia lo que ven los demas.</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "light", label: "Claro", icon: Sun },
            { value: "dark", label: "Oscuro", icon: Moon },
            { value: null, label: "Del negocio", icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => changeTheme(value)}
              disabled={savingTheme}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                userTheme === value
                  ? "border-brand-blue bg-brand-blue/5 text-brand-blue"
                  : "border-gray-200 dark:border-white/10 text-brand-gray hover:border-gray-300 dark:hover:border-white/20"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Link de agenda */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="font-bold text-brand-dark">Mi link de agenda</h3>
        <p className="text-xs text-brand-gray">Comparte este link en tu Instagram o redes para que tus clientes agenden contigo directo.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-brand-blue bg-brand-light px-3 py-2 rounded-xl border border-gray-200 truncate">
            {bookingLink.replace(/^https?:\/\//, "")}
          </code>
          <button onClick={() => { navigator.clipboard.writeText(bookingLink); showToast("Link copiado!", "success"); }}
            className="px-3 py-2 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PIN */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="font-bold text-brand-dark">PIN Standby</h3>
        <p className="text-xs text-brand-gray">Tu código personal para acceder al modo Standby.</p>
        <div className="text-center py-4">
          <span className="text-3xl font-mono font-bold tracking-[0.5em] text-brand-dark">
            {data.personal_pin || "----"}
          </span>
        </div>
        <p className="text-[10px] text-brand-gray text-center">Si necesitas cambiarlo, pídelo a tu administrador.</p>
      </div>
    </div>
  );
}
