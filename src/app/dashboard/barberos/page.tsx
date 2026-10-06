"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface Barber {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  role?: string;
  active?: boolean;
}

export default function BarberosPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [inactiveBarbers, setInactiveBarbers] = useState<Barber[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", birthDate: "", password: "", role: "barber" });
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const { effectiveRole } = useAuth();
  const router = useRouter();

  // A receptionist can open this page, but only to edit each professional's work
  // schedule. All team-management actions (create, invite, deactivate, delete) are
  // hidden for them — Nico asked to keep that off the receptionist's plate.
  const scheduleOnly = effectiveRole === "receptionist";

  // Get tenant ID (from context or localStorage override for super_admin)
  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return null;
  };

  const fetchBarbers = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const params = new URLSearchParams();
      if (t) params.set("tenantId", t);
      params.set("includeInactive", "true");
      const res = await fetch(`/api/barberos?${params.toString()}`);
      const data = await res.json();
      const all: Barber[] = Array.isArray(data) ? data : [];
      setBarbers(all.filter((b: any) => b.active !== false));
      setInactiveBarbers(all.filter((b: any) => b.active === false));
    } catch (err) {
      console.error("Error fetching barbers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchBarbers();
  }, [tenantLoading, tenant?.id]);

  const [creatingMember, setCreatingMember] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingMember) return; // evita crear dos veces con un doble toque
    setCreatingMember(true);
    try {
      const res = await fetch("/api/barberos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, tenantId: getActiveTenantId() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg = typeof data?.error === "string" && data.error.trim() && data.error.trim() !== "{}" ? data.error : `No se pudo crear el miembro (error ${res.status}). Intenta de nuevo; si sigue igual, avisa a soporte.`;
        showToast(msg, "error");
        return;
      }
      showToast("Miembro creado. Se envio email con credenciales.", "success");
      setShowModal(false);
      setFormData({ name: "", email: "", phone: "", birthDate: "", password: "", role: "barber" });
      fetchBarbers();
    } catch {
      showToast("No se pudo conectar con el servidor. Revisa tu internet e intenta de nuevo.", "error");
    } finally {
      setCreatingMember(false);
    }
  };

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const generateInviteCode = async () => {
    if (!tenant?.id) {
      showToast("Error: no se pudo obtener el negocio. Recarga la pagina.", "error");
      return;
    }
    setGeneratingCode(true);
    try {
      const res = await fetch("/api/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      const data = await res.json();
      if (data.code) {
        setInviteCode(data.code);
        showToast("Codigo generado", "success");
      } else {
        showToast(data.error || "Error al generar codigo", "error");
      }
    } catch (err) {
      showToast("Error de conexion", "error");
    }
    setGeneratingCode(false);
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Equipo</h1>
        {!scheduleOnly && (
          <button onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            Nuevo Miembro
          </button>
        )}
      </div>

      {scheduleOnly && (
        <p className="text-sm text-brand-gray bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          Toca un profesional para editar su horario de trabajo.
        </p>
      )}

      {/* Invite Code — admin only */}
      {!scheduleOnly && (
      <div className="bg-gradient-to-r from-brand-blue/5 to-brand-accent/5 rounded-2xl border border-brand-blue/20 p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-brand-dark">Codigo de invitacion</p>
          <p className="text-xs text-brand-gray">Comparte este codigo para que un profesional se una a tu negocio al registrarse.</p>
        </div>
        {inviteCode ? (
          <div className="flex items-center gap-2">
            <span className="px-4 py-2 bg-white border border-gray-200 rounded-xl font-mono text-lg font-bold text-brand-dark tracking-widest">{inviteCode}</span>
            <button onClick={() => { navigator.clipboard.writeText(inviteCode); showToast("Codigo copiado!", "success"); }}
              className="px-3 py-2 bg-brand-blue text-white text-xs rounded-xl hover:bg-brand-blue/90">Copiar</button>
          </div>
        ) : (
          <button onClick={generateInviteCode} disabled={generatingCode || tenantLoading || !tenant?.id}
            className="px-4 py-2 bg-brand-blue text-white text-sm rounded-xl hover:bg-brand-blue/90 disabled:opacity-50 whitespace-nowrap">
            {generatingCode ? "Generando..." : tenantLoading ? "Cargando..." : "Generar codigo"}
          </button>
        )}
      </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Nombre</th>
              <th className="text-left p-4 font-medium text-gray-600">Email</th>
              <th className="text-left p-4 font-medium text-gray-600">Telefono</th>
              <th className="text-right p-4 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={4}><Spinner /></td></tr>
            ) : barbers.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-gray-500">No hay profesionales</td></tr>
            ) : barbers.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium text-blue-600 cursor-pointer" onClick={() => router.push(`/dashboard/barberos/${b.id}`)}>
                  <div className="flex items-center gap-3">
                    {b.avatar_url ? (
                      <img src={b.avatar_url} alt={b.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                        {b.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                    {b.name}
                    {b.role === "receptionist" && (
                      <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-bold rounded">RECEPCION</span>
                    )}
                  </div>
                </td>
                <td className="p-4">{b.email || "-"}</td>
                <td className="p-4">{b.phone || "-"}</td>
                <td className="p-4 text-right">
                  {!scheduleOnly && (
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    // This only deactivates (hides from agenda/booking) — it does NOT
                    // free up the email. Use "Eliminar definitivamente" in the
                    // inactive list below for that.
                    if (!confirm(`Desactivar a "${b.name}"? Ya no aparecera en agenda ni booking. Su cuenta y correo seguiran existiendo; si quieres liberar el correo, luego usa "Eliminar definitivamente" en la lista de inactivos.`)) return;
                    await fetch(`/api/barberos/${b.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: false }),
                    });
                    showToast("Profesional desactivado", "success");
                    fetchBarbers();
                  }} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                    Desactivar
                  </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deactivated professionals: still exist in the system (their email stays
          taken) until purged for real. This is where "no puedo crear a Enzo porque ya
          existe una cuenta con ese email" gets solved — reactivate them, or purge them
          for good if they were only a test/duplicate. */}
      {!scheduleOnly && inactiveBarbers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setShowInactive(!showInactive)}
            className="w-full flex items-center justify-between p-4 text-left">
            <span className="text-sm font-medium text-gray-600">
              Profesionales desactivados ({inactiveBarbers.length})
            </span>
            <span className="text-xs text-gray-400">{showInactive ? "Ocultar ▲" : "Mostrar ▼"}</span>
          </button>
          {showInactive && (
            <div className="border-t divide-y">
              {inactiveBarbers.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-4 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500 truncate">{b.name}</p>
                    <p className="text-xs text-gray-400 truncate">{b.email || "-"}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={async () => {
                      await fetch(`/api/barberos/${b.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ active: true }),
                      });
                      showToast("Profesional reactivado", "success");
                      fetchBarbers();
                    }} className="px-3 py-1 text-xs border border-green-200 text-green-700 rounded-lg hover:bg-green-50">
                      Reactivar
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`Eliminar DEFINITIVAMENTE a "${b.name}" (${b.email})? Esto libera su correo para poder reusarlo. Solo se puede si no tiene citas, ventas ni comisiones registradas. Esta accion no se puede deshacer.`)) return;
                      const res = await fetch(`/api/barberos/${b.id}`, { method: "DELETE" });
                      const data = await res.json();
                      if (res.ok) {
                        showToast(`Eliminado. El correo ${data.purgedEmail} ya esta libre.`, "success");
                        fetchBarbers();
                      } else {
                        showToast(data.error || "No se pudo eliminar", "error");
                      }
                    }} className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">
                      Eliminar definitivamente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">Nuevo Miembro del Equipo</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                <input type="text" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de nacimiento</label>
                <input type="date" value={formData.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input type="password" required value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="barber">Profesional</option>
                  <option value="receptionist">Recepcionista</option>
                  <option value="admin">Administrador</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {formData.role === "barber" && "Ve su agenda, standby, clientes y comisiones"}
                  {formData.role === "receptionist" && "Ve POS, calendario, clientes y recepcion. Sin acceso a finanzas."}
                  {formData.role === "admin" && "Acceso completo al negocio (sin super admin)"}
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  disabled={!formData.name.trim() || !formData.email.trim() || creatingMember}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">{creatingMember ? "Guardando…" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
