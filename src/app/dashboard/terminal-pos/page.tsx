"use client";

import { useState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { createClient } from "@/lib/supabase/client";
import MpSetupGuide, { MP_DEVICE_PREFIX } from "@/components/terminal-pos/mp-setup-guide";

// Terminal POS — single place to configure whichever card terminal the POS charges
// to. Before this page existed, the same job was split across two disconnected
// places: the "MercadoPago Point" + "TUU" sections inside Configuracion (tenant-scoped,
// multi-terminal), and a separate /dashboard/mercadopago page with an OLDER, different
// model ("Terminal de la Casa" global to the whole app + per-barber rental terminals).
// That split is exactly what caused the confusion Javier ran into. Everything now
// lives here; Configuracion no longer has a payments section at all.

// Oculto a pedido de Pablo (2026-09-23): TUU se sigue guardando/funcionando tal cual
// (nada de su logica se toco), solo no se muestra en pantalla a los usuarios mientras
// se termina de integrar al 100%. Volver a true para mostrarlo de nuevo.
const TUU_VISIBLE_TO_USERS = false;

interface MpTerminal { id: string; name: string; device_id: string; terminal_type: string; active: boolean; }
interface TuuTerminal { id: string; name: string; device_serial: string; terminal_type: string; active: boolean; }
interface RentalTerminal { id: string; name: string; hasToken: boolean; deviceId: string | null; }

export default function TerminalPosPage() {
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading, switchTenant } = useTenant();
  const supabase = createClient();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // A super_admin account isn't tied to a single business (tenant_id is empty), so
  // there's no tenant to configure terminals for until they pick one. Without this the
  // page sat on "Cargando..." forever and every button answered "espera a que cargue".
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string }>>([]);

  // Which provider the POS actually charges to.
  const [cardProvider, setCardProvider] = useState<"mercadopago" | "tuu">("mercadopago");
  const [providerSaving, setProviderSaving] = useState(false);

  // MercadoPago
  const [mpToken, setMpToken] = useState("");
  const [mpConfigured, setMpConfigured] = useState(false);
  const [mpSaving, setMpSaving] = useState(false);
  const [mpTerminals, setMpTerminals] = useState<MpTerminal[]>([]);
  const [showAddMpTerminal, setShowAddMpTerminal] = useState(false);
  const [newMpTerminal, setNewMpTerminal] = useState({ name: "", device_id: "", terminal_type: "all", access_token: "" });

  // TUU (Haulmer)
  const [tuuApiKey, setTuuApiKey] = useState("");
  const [tuuConfigured, setTuuConfigured] = useState(false);
  const [tuuSaving, setTuuSaving] = useState(false);
  const [tuuTerminals, setTuuTerminals] = useState<TuuTerminal[]>([]);
  const [showAddTuuTerminal, setShowAddTuuTerminal] = useState(false);
  const [newTuuTerminal, setNewTuuTerminal] = useState({ name: "", device_serial: "", terminal_type: "all" });

  // Per-professional terminals (rental / "Arriendo" mode) — a professional renting
  // their chair can have their own MP terminal instead of the shared business one.
  const [rentalTerminals, setRentalTerminals] = useState<RentalTerminal[]>([]);
  const [editingRentalId, setEditingRentalId] = useState<string | null>(null);
  const [rentalToken, setRentalToken] = useState("");
  const [rentalDevice, setRentalDevice] = useState("");

  useEffect(() => {
    if (tenantLoading) return;
    resolveTenantAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, tenantLoading]);

  // Resolve the tenant the same way the rest of the dashboard does: the reliable
  // server-provided context first, then a super_admin's manual tenant override
  // (localStorage, set by the tenant switcher), then finally a direct lookup from the
  // logged-in user's profile. Without this fallback chain, a super_admin viewing this
  // page got stuck on tenantId = null forever — every button showed "espera a que
  // cargue" and the terminals never loaded (they were never gone, the page just never
  // asked for them).
  const resolveTenantAndFetch = async () => {
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
        const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
        id = profile?.tenant_id || null;
      }
    }
    setTenantId(id);

    if (!id) {
      // No business resolved. For a super_admin that's expected (their account spans
      // all businesses), so offer an explicit picker instead of a dead page.
      try {
        const res = await fetch("/api/superadmin/tenants");
        const data = await res.json();
        if (Array.isArray(data)) {
          setAvailableTenants(data.map((t: any) => ({ id: t.id, name: t.name })));
        }
      } catch {}
      setLoading(false);
      return;
    }

    fetchAll(id);
  };

  const fetchAll = async (id: string) => {
    setLoading(true);
    try {
      const [mpRes, mpTermRes, tuuRes, tuuTermRes, rentalRes] = await Promise.all([
        fetch(`/api/settings/mercadopago?tenantId=${id}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/settings/mercadopago/terminals?tenantId=${id}`).then((r) => r.json()).catch(() => []),
        fetch(`/api/settings/tuu?tenantId=${id}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/settings/tuu/terminals?tenantId=${id}`).then((r) => r.json()).catch(() => []),
        fetch(`/api/mercadopago/terminals?tenantId=${id}`).then((r) => r.json()).catch(() => ({ terminals: [] })),
      ]);

      if (mpRes) {
        setMpToken(mpRes.mp_access_token || "");
        setMpConfigured(mpRes.mp_configured || false);
      }
      if (Array.isArray(mpTermRes)) setMpTerminals(mpTermRes);

      if (tuuRes) {
        setTuuApiKey(tuuRes.tuu_api_key || "");
        setTuuConfigured(tuuRes.tuu_configured || false);
        setCardProvider(tuuRes.card_payment_provider === "tuu" ? "tuu" : "mercadopago");
      }
      if (Array.isArray(tuuTermRes)) setTuuTerminals(tuuTermRes);

      if (Array.isArray(rentalRes?.terminals)) setRentalTerminals(rentalRes.terminals);
    } finally {
      setLoading(false);
    }
  };

  const setProvider = async (provider: "mercadopago" | "tuu") => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    if (provider === "tuu" && !tuuConfigured && tuuTerminals.length === 0) {
      showToast("Primero guarda tu API Key y agrega una terminal TUU", "error");
      return;
    }
    setProviderSaving(true);
    const res = await fetch("/api/settings/tuu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, card_payment_provider: provider }),
    });
    setProviderSaving(false);
    if (res.ok) {
      setCardProvider(provider);
      showToast(`El POS ahora cobra con ${provider === "tuu" ? "TUU" : "MercadoPago"}`, "success");
    } else {
      showToast("No se pudo cambiar la maquina activa", "error");
    }
  };

  const saveMpToken = async () => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    setMpSaving(true);
    const res = await fetch("/api/settings/mercadopago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, mp_access_token: mpToken }),
    });
    setMpSaving(false);
    if (res.ok) {
      setMpConfigured(true);
      showToast("Token guardado", "success");
    } else {
      showToast("No se pudo guardar el token", "error");
    }
  };

  const addMpTerminal = async () => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    if (!newMpTerminal.name || !newMpTerminal.device_id || newMpTerminal.device_id.trim() === MP_DEVICE_PREFIX) {
      showToast("Completa nombre y Device ID (prefijo + número de serie)", "error");
      return;
    }
    const res = await fetch("/api/settings/mercadopago/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, ...newMpTerminal }),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      setMpTerminals((prev) => [...prev, data]);
      setShowAddMpTerminal(false);
      setNewMpTerminal({ name: "", device_id: "", terminal_type: "all", access_token: "" });
      showToast("Terminal agregado", "success");
    } else {
      showToast(data.error || "No se pudo agregar la terminal", "error");
    }
  };

  const saveTuuKey = async () => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    setTuuSaving(true);
    const res = await fetch("/api/settings/tuu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, tuu_api_key: tuuApiKey }),
    });
    setTuuSaving(false);
    if (res.ok) {
      setTuuConfigured(true);
      showToast("API Key guardada", "success");
    } else {
      showToast("No se pudo guardar la API Key", "error");
    }
  };

  const addTuuTerminal = async () => {
    if (!tenantId) {
      showToast("Espera un momento a que cargue la pagina y vuelve a intentar.", "error");
      return;
    }
    if (!newTuuTerminal.name || !newTuuTerminal.device_serial) {
      showToast("Completa nombre y numero de serie", "error");
      return;
    }
    const res = await fetch("/api/settings/tuu/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, ...newTuuTerminal }),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      setTuuTerminals((prev) => [...prev, data]);
      setShowAddTuuTerminal(false);
      setNewTuuTerminal({ name: "", device_serial: "", terminal_type: "all" });
      showToast("Terminal agregado", "success");
    } else {
      showToast(data.error || "No se pudo agregar la terminal", "error");
    }
  };

  const saveRentalTerminal = async (barberId: string) => {
    const res = await fetch("/api/mercadopago/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId, accessToken: rentalToken, deviceId: rentalDevice }),
    });
    if (res.ok) {
      showToast("Terminal del profesional guardado", "success");
      setEditingRentalId(null);
      setRentalToken("");
      setRentalDevice("");
      if (tenantId) fetchAll(tenantId);
    } else {
      showToast("No se pudo guardar", "error");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin" />
      </div>
    );
  }

  // No business selected yet (typical for a super_admin account, which isn't tied to
  // one business). The terminals are configured per business, so ask which one first
  // instead of showing empty forms that can't save.
  if (!tenantId) {
    return (
      <div className="p-3 md:p-6 space-y-3 md:space-y-4 animate-fade-in max-w-3xl">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Terminal POS</h1>
          <p className="text-sm text-brand-gray">Configura la maquina de cobro con tarjeta que usa el Punto de Venta</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-brand-dark">Elige el negocio</h2>
            <p className="text-xs text-brand-gray">
              Tu cuenta administra varios negocios, y cada uno tiene sus propias maquinas de cobro.
              Selecciona con cual quieres trabajar.
            </p>
          </div>

          {availableTenants.length > 0 ? (
            <div className="space-y-2">
              {availableTenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => switchTenant(t.id, t.name)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-brand-blue hover:bg-brand-blue/5 transition-colors text-left"
                >
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
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Terminal POS</h1>
        <p className="text-sm text-brand-gray">Configura la maquina de cobro con tarjeta que usa el Punto de Venta</p>
      </div>

      {/* Active provider selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-3">
        <label className="block text-sm font-medium text-brand-dark">Maquina activa para cobrar con tarjeta</label>
        <p className="text-xs text-brand-gray">El Punto de Venta siempre cobra con la que elijas aqui, sin importar cuantas tengas configuradas abajo.</p>
        <div className={TUU_VISIBLE_TO_USERS ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
          <button
            onClick={() => setProvider("mercadopago")}
            disabled={providerSaving}
            className={`py-3 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${cardProvider === "mercadopago" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-brand-gray border-gray-200 hover:bg-gray-50"}`}
          >
            MercadoPago
          </button>
          {TUU_VISIBLE_TO_USERS && (
            <button
              onClick={() => setProvider("tuu")}
              disabled={providerSaving}
              className={`py-3 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${cardProvider === "tuu" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-brand-gray border-gray-200 hover:bg-gray-50"}`}
            >
              TUU
            </button>
          )}
        </div>
      </div>

      <MpSetupGuide
        onUseDeviceId={(id) => {
          setNewMpTerminal((prev) => ({ ...prev, device_id: id }));
          setShowAddMpTerminal(true);
          showToast("Device ID cargado en «Nuevo terminal»", "success");
        }}
      />

      {/* MercadoPago Config */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-500" />
          <div>
            <h2 className="font-bold text-brand-dark">MercadoPago Point</h2>
            <p className="text-xs text-brand-gray">Token de la cuenta y maquinas asociadas</p>
          </div>
          {(mpConfigured || mpTerminals.length > 0) && (
            <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">CONFIGURADO</span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">Access Token (Produccion)</label>
            <input
              type="password"
              value={mpToken}
              onChange={(e) => setMpToken(e.target.value)}
              placeholder="APP_USR-xxxxxxxx-xxxx-xxxx..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono"
            />
            <p className="text-[10px] text-brand-gray mt-1">
              Obtenlo en <a href="https://www.mercadopago.cl/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">mercadopago.cl/developers</a> → Tu aplicacion → Credenciales de produccion
            </p>
          </div>

          <button
            onClick={saveMpToken}
            disabled={mpSaving || !mpToken || !tenantId}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mpSaving ? "Guardando..." : "Guardar Token"}
          </button>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-brand-dark">Terminales</p>
                <p className="text-[10px] text-brand-gray">Agrega multiples maquinas y asigna cuales cobran servicios y cuales productos</p>
              </div>
              <button
                onClick={() => { setNewMpTerminal((prev) => ({ ...prev, device_id: prev.device_id || MP_DEVICE_PREFIX })); setShowAddMpTerminal(true); }}
                className="px-3 py-1.5 bg-brand-blue text-white text-xs rounded-lg hover:bg-brand-blue/90 font-medium"
              >
                + Anadir terminal
              </button>
            </div>

            {mpTerminals.length > 0 ? (
              <div className="space-y-2">
                {mpTerminals.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-dark truncate">{t.name}</p>
                      <p className="text-[10px] font-mono text-brand-gray truncate">{t.device_id}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${
                      t.terminal_type === "services" ? "bg-purple-100 text-purple-700" :
                      t.terminal_type === "products" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {t.terminal_type === "services" ? "SERVICIOS" :
                       t.terminal_type === "products" ? "PRODUCTOS" : "TODO"}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm(`Eliminar terminal "${t.name}"?`)) return;
                        await fetch(`/api/settings/mercadopago/terminals?id=${t.id}`, { method: "DELETE" });
                        setMpTerminals((prev) => prev.filter((x) => x.id !== t.id));
                        showToast("Terminal eliminado", "success");
                      }}
                      className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-brand-gray">No hay terminales configurados</p>
                <p className="text-[10px] text-brand-gray mt-1">Agrega una maquina para empezar a cobrar con MercadoPago</p>
              </div>
            )}
          </div>

          {showAddMpTerminal && (
            <div className="border border-brand-blue/20 bg-brand-blue/5 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-brand-dark">Nuevo Terminal</p>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Nombre</label>
                <input
                  type="text"
                  value={newMpTerminal.name}
                  onChange={(e) => setNewMpTerminal({ ...newMpTerminal, name: e.target.value })}
                  placeholder="Ej: Maquina Servicios"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Device ID</label>
                <input
                  type="text"
                  value={newMpTerminal.device_id}
                  onChange={(e) => setNewMpTerminal({ ...newMpTerminal, device_id: e.target.value })}
                  placeholder="NEWLAND_N950__SERIAL"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-[10px] text-brand-gray mt-1">Prefijo + número de serie (S/N de la etiqueta trasera), sin espacios.</p>
              </div>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Tipo de cobro</label>
                <select
                  value={newMpTerminal.terminal_type}
                  onChange={(e) => setNewMpTerminal({ ...newMpTerminal, terminal_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Todo (servicios + productos)</option>
                  <option value="services">Solo Servicios (exento IVA)</option>
                  <option value="products">Solo Productos (afecto IVA)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Access Token (opcional, si tiene cuenta propia)</label>
                <input
                  type="password"
                  value={newMpTerminal.access_token}
                  onChange={(e) => setNewMpTerminal({ ...newMpTerminal, access_token: e.target.value })}
                  placeholder="Dejar vacio para usar el token global"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowAddMpTerminal(false); setNewMpTerminal({ name: "", device_id: "", terminal_type: "all", access_token: "" }); }}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={addMpTerminal}
                  disabled={!newMpTerminal.name || newMpTerminal.device_id.trim() === MP_DEVICE_PREFIX || !newMpTerminal.device_id.trim() || !tenantId}
                  className="flex-1 py-2 bg-brand-blue text-white rounded-lg text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TUU (Haulmer) Config — oculto a los usuarios via TUU_VISIBLE_TO_USERS, pero
          el bloque completo (JSX, estado, llamadas a la API) queda intacto abajo. */}
      {TUU_VISIBLE_TO_USERS && (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-500" />
          <div>
            <h2 className="font-bold text-brand-dark">TUU (Haulmer)</h2>
            <p className="text-xs text-brand-gray">API Key del comercio y maquinas asociadas</p>
          </div>
          {(tuuConfigured || tuuTerminals.length > 0) && (
            <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">CONFIGURADO</span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-gray mb-1">API Key</label>
            <input
              type="password"
              value={tuuApiKey}
              onChange={(e) => setTuuApiKey(e.target.value)}
              placeholder="Clave de tu comercio"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono"
            />
            <p className="text-[10px] text-brand-gray mt-1">
              Obtenla en tu Espacio de Trabajo (Workspace) TUU, sección Pagos → Configuración → API. Es unica por comercio, no por maquina.
            </p>
          </div>

          <button
            onClick={saveTuuKey}
            disabled={tuuSaving || !tuuApiKey || !tenantId}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {tuuSaving ? "Guardando..." : "Guardar API Key"}
          </button>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-brand-dark">Terminales TUU</p>
                <p className="text-[10px] text-brand-gray">Numero de serie (SN) impreso en la etiqueta de la maquina</p>
              </div>
              <button
                onClick={() => setShowAddTuuTerminal(true)}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-medium"
              >
                + Anadir terminal
              </button>
            </div>

            {tuuTerminals.length > 0 ? (
              <div className="space-y-2">
                {tuuTerminals.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-dark truncate">{t.name}</p>
                      <p className="text-[10px] font-mono text-brand-gray truncate">{t.device_serial}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${
                      t.terminal_type === "services" ? "bg-purple-100 text-purple-700" :
                      t.terminal_type === "products" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {t.terminal_type === "services" ? "SERVICIOS" :
                       t.terminal_type === "products" ? "PRODUCTOS" : "TODO"}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm(`Eliminar terminal "${t.name}"?`)) return;
                        await fetch(`/api/settings/tuu/terminals?id=${t.id}`, { method: "DELETE" });
                        setTuuTerminals((prev) => prev.filter((x) => x.id !== t.id));
                        showToast("Terminal eliminado", "success");
                      }}
                      className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-brand-gray">No hay terminales configurados</p>
                <p className="text-[10px] text-brand-gray mt-1">Agrega la maquina para empezar a cobrar con TUU</p>
              </div>
            )}
          </div>

          {showAddTuuTerminal && (
            <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-brand-dark">Nueva terminal TUU</p>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Nombre</label>
                <input
                  type="text"
                  value={newTuuTerminal.name}
                  onChange={(e) => setNewTuuTerminal({ ...newTuuTerminal, name: e.target.value })}
                  placeholder="Ej: Maquina Recepcion"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Numero de serie (SN)</label>
                <input
                  type="text"
                  value={newTuuTerminal.device_serial}
                  onChange={(e) => setNewTuuTerminal({ ...newTuuTerminal, device_serial: e.target.value })}
                  placeholder="Ej: 6010B232571510771"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-[10px] text-brand-gray mt-1">Esta impreso bajo "SN:" en la etiqueta detras de la maquina, junto al codigo QR de ayuda.</p>
              </div>
              <div>
                <label className="block text-[10px] text-brand-gray mb-1">Tipo de cobro</label>
                <select
                  value={newTuuTerminal.terminal_type}
                  onChange={(e) => setNewTuuTerminal({ ...newTuuTerminal, terminal_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Todo (servicios + productos)</option>
                  <option value="services">Solo Servicios (exento IVA)</option>
                  <option value="products">Solo Productos (afecto IVA)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowAddTuuTerminal(false); setNewTuuTerminal({ name: "", device_serial: "", terminal_type: "all" }); }}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={addTuuTerminal}
                  disabled={!newTuuTerminal.name || !newTuuTerminal.device_serial || !tenantId}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Per-professional terminals (Arriendo) — only relevant if there's at least one
          rental professional, only supported for MercadoPago today. */}
      {rentalTerminals.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-brand-dark">Terminales por Profesional (Arriendo)</h2>
            <p className="text-xs text-brand-gray">Un profesional en modalidad Arriendo puede tener su propia maquina MercadoPago en vez de usar la del negocio.</p>
          </div>

          <div className="space-y-3">
            {rentalTerminals.map((t) => (
              <div key={t.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${t.hasToken ? "bg-green-500" : "bg-gray-300"}`} />
                    <div>
                      <p className="font-medium text-brand-dark">{t.name}</p>
                      <p className="text-xs text-brand-gray">
                        {t.hasToken ? `Device: ${t.deviceId || "Sin device"}` : "Usa la maquina del negocio"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingRentalId(editingRentalId === t.id ? null : t.id); setRentalDevice(t.deviceId || ""); setRentalToken(""); }}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-brand-gray"
                  >
                    {editingRentalId === t.id ? "Cancelar" : "Configurar"}
                  </button>
                </div>

                {editingRentalId === t.id && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div>
                      <label className="text-xs text-brand-gray block mb-1">Access Token (si es diferente al del negocio)</label>
                      <input type="password" value={rentalToken} onChange={(e) => setRentalToken(e.target.value)}
                        placeholder="Dejar vacio = usa el del negocio"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-brand-gray block mb-1">Device ID</label>
                      <input type="text" value={rentalDevice} onChange={(e) => setRentalDevice(e.target.value)}
                        placeholder="NEWLAND_N950__..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <button onClick={() => saveRentalTerminal(t.id)} disabled={!rentalDevice}
                      className="px-4 py-2 bg-brand-blue text-white text-sm rounded-xl hover:opacity-90 disabled:opacity-50">
                      Guardar Terminal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
