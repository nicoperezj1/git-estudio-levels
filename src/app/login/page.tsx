"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Google login is not wired end-to-end yet (the button did nothing). Hidden for the
// first phase; flip to true once the OAuth callback is configured.
const GOOGLE_LOGIN_ENABLED = false;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail }),
    });
    setForgotSent(true);
    setForgotLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Clear any existing session first
    // Also drop any leftover super_admin tenant override from a previous session in
    // this browser, so the incoming user never inherits another business's context.
    try { localStorage.removeItem("tenant_override"); } catch {}
    await supabase.auth.signOut();

    const { error, data: authData } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Credenciales incorrectas");
      setLoading(false);
    } else {
      // Log session
      const ua = navigator.userAgent;
      const device = /Mobile|Android|iPhone/i.test(ua) ? "mobile" : /Tablet|iPad/i.test(ua) ? "tablet" : "desktop";
      const browser = /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Otro";
      fetch("/api/auth/log-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authData?.user?.id, userEmail: email, device, browser }),
      });

      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light p-4 relative overflow-hidden">
      {/* Background watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg className="w-[600px] h-[600px] text-brand-blue/[0.03]" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 4a12 12 0 0 1 12 12h-4a8 8 0 0 0-8-8V4z"/>
          <path d="M28 16a12 12 0 0 1-12 12v-4a8 8 0 0 0 8-8h4z" opacity="0.7"/>
          <path d="M16 28A12 12 0 0 1 4 16h4a8 8 0 0 0 8 8v4z" opacity="0.4"/>
        </svg>
      </div>

      {/* Subtle gradient orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-brand-blue/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl shadow-blue-900/5 p-6 md:p-8 animate-scale-in">
        <div className="text-center mb-8">
          <a href="/landing">
            <img src="/logo-icon.png" alt="re-booking" className="w-16 h-16 mx-auto mb-3 drop-shadow-lg cursor-pointer hover:scale-105 transition-transform" />
          </a>
          <img src="/logo-horizontal.png" alt="re-booking" className="h-8 w-auto mx-auto mb-2" />
          <p className="text-xs text-brand-gray uppercase tracking-[0.2em]">Todo tu negocio. Un solo sistema.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-brand-gray">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex h-11 w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-2 text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-brand-gray">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 pr-10 py-2 text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-dark transition-colors"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-bold uppercase tracking-wider hover:bg-blue-700 disabled:opacity-70 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Ingresando...
              </>
            ) : "Ingresar"}
          </button>

          {/* Forgot password */}
          <div className="text-center pt-1">
            <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); }}
              className="text-xs text-brand-gray hover:text-brand-blue transition-colors">
              Olvidaste tu contraseña?
            </button>
          </div>
        </form>

        {/* Google Sign In — hidden for now (first phase). The OAuth flow isn't fully
            wired yet, so the button did nothing and only confused users. Re-enable by
            flipping GOOGLE_LOGIN_ENABLED once the callback is set up. */}
        {GOOGLE_LOGIN_ENABLED && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-brand-gray">o</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: `${window.location.origin}/auth/callback` },
                });
              }}
              className="w-full h-11 rounded-xl border border-gray-200 bg-white text-sm font-medium text-brand-dark hover:bg-gray-50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </button>
          </>
        )}
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForgot(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {forgotSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">📧</div>
                <h3 className="font-bold text-brand-dark">Revisa tu email</h3>
                <p className="text-sm text-brand-gray mt-2">Si la cuenta existe, recibiras un link para restablecer tu contraseña.</p>
                <button onClick={() => { setShowForgot(false); setForgotSent(false); }}
                  className="mt-4 px-6 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium">
                  Entendido
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot}>
                <h3 className="font-bold text-brand-dark text-lg">Recuperar contraseña</h3>
                <p className="text-sm text-brand-gray mt-1 mb-4">Ingresa tu email y te enviaremos un link.</p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  autoFocus
                />
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => setShowForgot(false)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={forgotLoading}
                    className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-70">
                    {forgotLoading ? "Enviando..." : "Enviar link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Version + Landing link */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        <a href="/landing" className="rb-hide-in-app text-xs text-brand-gray hover:text-brand-blue transition-colors">
          Conoce re-booking →
        </a>
        <p className="text-[10px] text-brand-gray/50 mt-1">v1.0</p>
      </div>
    </div>
  );
}
