"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Primer ingreso de un negocio nuevo: reemplaza la clave temporal del correo por una propia.
export default function CambiarClavePage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La clave debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las claves no coinciden");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes("different")
          ? "La clave nueva debe ser distinta de la temporal"
          : "No se pudo cambiar la clave. Intenta de nuevo."
      );
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/clear-temp-password", { method: "POST" });
    if (!res.ok) {
      setError("Tu clave se cambio, pero no pudimos terminar el proceso. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (!ready) return null;

  const inputClass =
    "flex h-11 w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-2 text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl shadow-blue-900/5 p-6 md:p-8">
        <div className="text-center mb-6">
          <img src="/logo-horizontal.png" alt="re-booking" className="h-8 w-auto mx-auto mb-3" />
          <h1 className="text-lg font-bold text-brand-dark">Crea tu clave</h1>
          <p className="text-xs text-brand-gray mt-1">
            Por seguridad, reemplaza la clave temporal por una tuya antes de entrar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-brand-gray">Nueva clave</label>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimo 8 caracteres"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-xs font-medium text-brand-gray">Repite la clave</label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Vuelve a escribirla"
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-brand-gray cursor-pointer">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Mostrar claves
          </label>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {loading ? "Guardando..." : "Guardar y entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
