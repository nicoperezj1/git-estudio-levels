"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegistroPage() {
  const [step, setStep] = useState<"code" | "register">("code");
  const [inviteCode, setInviteCode] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const verifyCode = async () => {
    setError("");
    setLoading(true);
    const res = await fetch("/api/invite-codes/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: inviteCode }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.success) {
      setTenantName(data.tenantName);
      setTenantId(data.tenantId);
      setStep("register");
    } else {
      setError(data.error || "Codigo invalido");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Create account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: "barber" } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Link to tenant via invite code
    // Bug (reportado por Nico, 27-sep): esta llamada no revisaba la respuesta — si el
    // negocio ya alcanzo su limite de profesionales (ver /api/invite-codes/verify), la
    // cuenta de Auth ya creada arriba quedaba sin tenant_id/role asignado y el usuario
    // igual era enviado a /dashboard, con una cuenta rota y sin ningun aviso del error.
    if (authData.user) {
      const linkRes = await fetch("/api/invite-codes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode, userId: authData.user.id }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        setError(linkData.error || "No se pudo vincular la cuenta al negocio.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  };

  const handleGoogleSignUp = async () => {
    // Store invite code in localStorage so we can use it after OAuth callback
    localStorage.setItem("pending_invite_code", inviteCode);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/registro/link&code=${inviteCode}` },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl p-6 md:p-8 animate-scale-in">
        <div className="text-center mb-6">
          <img src="/logo-icon.png" alt="re-booking" className="w-14 h-14 mx-auto mb-3" />
          <img src="/logo-horizontal.png" alt="re-booking" className="h-7 w-auto mx-auto mb-2" />
        </div>

        {step === "code" ? (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-brand-dark">Unirse a un negocio</h2>
              <p className="text-xs text-brand-gray mt-1">Ingresa el codigo que te dio tu administrador</p>
            </div>

            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="CODIGO"
              maxLength={8}
              className="w-full h-14 text-center text-2xl font-mono font-bold tracking-[0.3em] rounded-xl border border-gray-200 bg-brand-light/50 text-brand-dark uppercase focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
            />

            {error && <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2">{error}</p>}

            <button
              onClick={verifyCode}
              disabled={loading || inviteCode.length < 4}
              className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50 transition-all"
            >
              {loading ? "Verificando..." : "Verificar codigo"}
            </button>

            <div className="text-center pt-2">
              <a href="/login" className="text-xs text-brand-gray hover:text-brand-blue">
                Ya tengo cuenta → Iniciar sesion
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs text-green-700 font-medium mb-3">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                {tenantName}
              </div>
              <h2 className="text-lg font-bold text-brand-dark">Crea tu cuenta</h2>
              <p className="text-xs text-brand-gray mt-1">Quedaras vinculado a {tenantName}</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre completo"
                required
                className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña (min 6 caracteres)"
                required
                minLength={6}
                className="w-full h-11 rounded-xl border border-gray-200 bg-brand-light/50 px-4 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:outline-none"
              />

              {error && <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50 transition-all"
              >
                {loading ? "Creando cuenta..." : "Crear cuenta"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-brand-gray">o</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleSignUp}
              className="w-full h-11 rounded-xl border border-gray-200 bg-white text-sm font-medium text-brand-dark hover:bg-gray-50 transition-all flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Registrarse con Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
