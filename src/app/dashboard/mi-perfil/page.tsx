"use client";

import { useState, useEffect } from "react";
import { MyTabBarCard } from "@/components/settings/tab-bar-cards";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useIsNativeApp } from "@/lib/native-app";
import { nativePushAvailable, nativePushEnabledFor, enableNativePush, disableNativePush } from "@/lib/native-push";
import { biometricAvailable, biometricLockEnabled, biometricVerify, setBiometricLockEnabled } from "@/lib/biometric";
import { Copy, Camera, Sun, Moon, Monitor, Trash2 } from "lucide-react";

export default function MiPerfilPage() {
  const { user } = useAuth();
  const { tenant, userTheme, setUserTheme } = useTenant();
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const router = useRouter();
  // Bloqueo con Face ID / huella (solo dentro de la app, si el telefono lo permite).
  const inApp = useIsNativeApp();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  useEffect(() => {
    if (!inApp) return;
    biometricAvailable().then(setBioAvailable);
    setBioOn(biometricLockEnabled());
  }, [inApp]);
  const toggleBio = async () => {
    if (bioOn) {
      setBiometricLockEnabled(false);
      setBioOn(false);
      return;
    }
    // Al activarlo se confirma una vez, para no dejar a nadie fuera por error.
    const ok = await biometricVerify("Confirma para activar el bloqueo");
    if (ok) {
      setBiometricLockEnabled(true);
      setBioOn(true);
    }
  };
  // Avisos nativos en este telefono (citas nuevas, cancelaciones, cliente llego...), solo dentro de la app.
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  useEffect(() => {
    if (!inApp) return;
    setPushAvailable(nativePushAvailable());
    setPushOn(nativePushEnabledFor(user?.id));
  }, [inApp, user?.id]);
  const togglePush = async () => {
    if (pushBusy || !user?.id) return;
    setPushBusy(true);
    setPushMsg("");
    try {
      if (pushOn) {
        await disableNativePush();
        setPushOn(false);
        return;
      }
      const r = await enableNativePush(user.id);
      if (r.ok) setPushOn(true);
      else if (r.reason === "denied") setPushMsg("No diste permiso. Puedes activarlo en Ajustes del teléfono → re-booking → Notificaciones.");
      else if (r.reason === "server") setPushMsg("Los avisos al teléfono todavía no están activos en el servidor. Inténtalo más tarde.");
      else setPushMsg("No se pudieron activar los avisos. Inténtalo de nuevo.");
    } finally {
      setPushBusy(false);
    }
  };
  // Seguridad: cambiar clave (todos) y correo (solo super admin). Se confirma con la clave actual.
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailPw, setMailPw] = useState("");
  const [newMail, setNewMail] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changePassword = async () => {
    if (pwBusy) return;
    setPwMsg(null);
    if (!curPw) return setPwMsg({ ok: false, text: "Escribe tu clave actual." });
    if (newPw.length < 8) return setPwMsg({ ok: false, text: "La clave nueva debe tener al menos 8 caracteres." });
    if (newPw !== newPw2) return setPwMsg({ ok: false, text: "Las claves nuevas no coinciden." });
    setPwBusy(true);
    try {
      const sb = createClient();
      const { data: { user: u } } = await sb.auth.getUser();
      if (!u?.email) return setPwMsg({ ok: false, text: "No se pudo verificar tu sesión. Vuelve a entrar." });
      const { error: e1 } = await sb.auth.signInWithPassword({ email: u.email, password: curPw });
      if (e1) return setPwMsg({ ok: false, text: "La clave actual no es correcta." });
      const { error: e2 } = await sb.auth.updateUser({ password: newPw });
      if (e2) return setPwMsg({ ok: false, text: e2.message || "No se pudo cambiar la clave." });
      setCurPw(""); setNewPw(""); setNewPw2("");
      setPwMsg({ ok: true, text: "Clave actualizada." });
    } finally {
      setPwBusy(false);
    }
  };
  const changeEmail = async () => {
    if (mailBusy) return;
    setMailMsg(null);
    setMailBusy(true);
    try {
      const res = await fetch("/api/profile/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: mailPw, newEmail: newMail }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) return setMailMsg({ ok: false, text: r.error || "No se pudo cambiar el correo." });
      setMailMsg({ ok: true, text: "Correo cambiado. Vuelve a entrar con el correo nuevo." });
      setTimeout(async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }, 1800);
    } catch {
      setMailMsg({ ok: false, text: "No se pudo cambiar el correo. Revisa tu conexión." });
    } finally {
      setMailBusy(false);
    }
  };
  // Eliminar mi cuenta (requisito de Apple y Google): se confirma con la contrasena.
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    if (!deletePassword || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/profile/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(result.error || "No se pudo eliminar la cuenta.");
        return;
      }
      try { localStorage.removeItem("tenant_override"); } catch {}
      await createClient().auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setDeleteError("No se pudo eliminar la cuenta. Revisa tu conexión.");
    } finally {
      setDeleting(false);
    }
  };

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

      {/* Barra inferior del celular (solo se ve en el celular) */}
      <MyTabBarCard />

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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 space-y-3">
        <h3 className="font-bold text-brand-dark">Seguridad</h3>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-brand-gray">Cambiar clave</p>
          <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Clave actual" autoComplete="current-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Clave nueva (mínimo 8 caracteres)" autoComplete="new-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="Repite la clave nueva" autoComplete="new-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{pwMsg.text}</p>}
          <button type="button" onClick={changePassword} disabled={pwBusy}
            className="rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {pwBusy ? "Cambiando..." : "Cambiar clave"}
          </button>
        </div>
        {user?.role === "super_admin" && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-brand-gray">Cambiar correo de ingreso</p>
            <input type="email" value={newMail} onChange={(e) => setNewMail(e.target.value)} placeholder="Correo nuevo" autoComplete="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            <input type="password" value={mailPw} onChange={(e) => setMailPw(e.target.value)} placeholder="Tu clave actual para confirmar" autoComplete="current-password"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            {mailMsg && <p className={`text-xs ${mailMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{mailMsg.text}</p>}
            <button type="button" onClick={changeEmail} disabled={mailBusy}
              className="rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {mailBusy ? "Cambiando..." : "Cambiar correo"}
            </button>
          </div>
        )}
      </div>

      {inApp && pushAvailable && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-dark">Avisos en este teléfono</p>
              <p className="text-xs text-brand-gray">Citas nuevas, cancelaciones y cuando llega un cliente, aunque la app esté cerrada.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pushOn}
              disabled={pushBusy}
              onClick={togglePush}
              className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${pushOn ? "bg-brand-blue" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${pushOn ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {pushMsg && <p className="mt-2 text-xs text-red-600">{pushMsg}</p>}
        </div>
      )}

      {inApp && bioAvailable && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-dark">Bloqueo con Face ID / huella</p>
              <p className="text-xs text-brand-gray">Pide tu identidad al abrir la app o al volver a ella.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={bioOn}
              onClick={toggleBio}
              className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${bioOn ? "bg-brand-blue" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${bioOn ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      )}

      {/* Eliminar cuenta */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
        <button
          type="button"
          onClick={() => { setShowDelete(true); setDeletePassword(""); setDeleteError(""); }}
          className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" /> Eliminar mi cuenta
        </button>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-brand-dark">Eliminar mi cuenta</h3>
            <p className="text-sm text-brand-gray">
              Perderás el acceso a re-booking y se borrarán tus datos personales (nombre, correo, teléfono y foto).
              Las citas y ventas del negocio se conservan, sin tus datos. Esto no se puede deshacer.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Escribe tu contraseña para confirmar"
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
            />
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!deletePassword || deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
