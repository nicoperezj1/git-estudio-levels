"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { formatCurrency } from "@/lib/utils";
import { EmptyState, EmptyIcons } from "@/components/ui/empty-state";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  admin_email: string;
  admin_name: string | null;
  phone: string | null;
  max_professionals: number;
  trial_ends_at: string | null;
  active: boolean;
  created_at: string;
  subscription: Array<{ plan: string; status: string; current_period_end: string | null }>;
}

const statusColors: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const planColors: Record<string, string> = {
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  enterprise: "bg-indigo-100 text-indigo-700",
};

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string; slug: string } | null>(null);
  const [form, setForm] = useState({
    name: "", slug: "", admin_email: "", admin_name: "", phone: "", address: "", rut_empresa: "", plan: "basic",
    logo_url: "", website: "", social_media: "", trial_days: "15", max_professionals: "",
  });
  const { showToast } = useToast();
  const { switchTenant } = useTenant();

  // Punto (Nico, 25-sep): opciones de gestion pedidas por Pablo — editar, eliminar
  // (permanente, para limpiar empresas ficticias/de prueba), ver contacto del dueño, y
  // confirmacion antes de entrar a operar como otro negocio.
  const [viewingContact, setViewingContact] = useState<any | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState<{ tenant: Tenant; counts?: any } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Punto (Nico, 25-sep): Pablo pidio ver una "vista previa" del negocio antes de entrar
  // a operar como el (antes era un confirm() de texto plano, sin datos reales del negocio).
  const [enteringTenant, setEnteringTenant] = useState<any | null>(null);
  const [loadingEnterPreview, setLoadingEnterPreview] = useState(false);
  const [entering, setEntering] = useState(false);

  const openContact = async (t: Tenant) => {
    setViewingContact({ ...t });
    setLoadingContact(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.id}`);
      if (res.ok) setViewingContact(await res.json());
    } finally {
      setLoadingContact(false);
    }
  };

  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setEditForm({
      name: t.name,
      admin_name: t.admin_name || "",
      admin_email: t.admin_email,
      phone: t.phone || "",
      plan: t.plan,
      status: t.status,
      max_professionals: t.max_professionals,
    });
  };

  const saveEdit = async () => {
    if (!editingTenant) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${editingTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "No se pudo guardar", "error");
        return;
      }
      showToast("Empresa actualizada", "success");
      setEditingTenant(null);
      fetchTenants();
    } finally {
      setSavingEdit(false);
    }
  };

  const openDelete = async (t: Tenant) => {
    setDeleteConfirmText("");
    setDeletingTenant({ tenant: t });
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.id}`);
      if (res.ok) {
        const data = await res.json();
        setDeletingTenant({ tenant: t, counts: data.counts });
      }
    } catch {}
  };

  const doDelete = async () => {
    if (!deletingTenant || deleteConfirmText !== deletingTenant.tenant.name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${deletingTenant.tenant.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: deleteConfirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "No se pudo eliminar", "error");
        return;
      }
      showToast("Empresa eliminada permanentemente", "success");
      setDeletingTenant(null);
      fetchTenants();
    } finally {
      setDeleting(false);
    }
  };

  // Entrar a operar como el negocio (Punto de Pablo, 25-sep: pedia confirmacion antes de
  // esto — antes era un solo click sin aviso; luego pidio ademas una vista previa real del
  // negocio en vez de solo un texto de confirmacion, asi que este modal reutiliza el mismo
  // endpoint de detalle+conteos que usa "Contacto").
  const openEnterPreview = async (t: Tenant) => {
    setEnteringTenant({ ...t });
    setLoadingEnterPreview(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.id}`);
      if (res.ok) setEnteringTenant(await res.json());
    } finally {
      setLoadingEnterPreview(false);
    }
  };

  const confirmEnter = () => {
    if (!enteringTenant) return;
    setEntering(true);
    switchTenant(enteringTenant.id, enteringTenant.name);
  };

  const fetchTenants = async () => {
    setLoading(true);
    const res = await fetch("/api/superadmin/tenants");
    setTenants(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const res = await fetch("/api/superadmin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setCreating(false);

    if (res.ok) {
      setCreatedInfo({ email: form.admin_email, password: data.temp_password, slug: form.slug });
      setShowCreate(false);
      setForm({ name: "", slug: "", admin_email: "", admin_name: "", phone: "", address: "", rut_empresa: "", plan: "starter", logo_url: "", website: "", social_media: "", trial_days: "15", max_professionals: "" });
      fetchTenants();
      showToast("Empresa creada exitosamente", "success");
    } else {
      showToast(data.error || "Error al crear", "error");
    }
  };

  const daysLeft = (date: string | null): number => {
    if (!date) return 0;
    return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Empresas</h1>
          <p className="text-sm text-brand-gray">Gestiona las empresas contratantes de re-booking</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 bg-brand-blue text-white text-sm font-medium rounded-xl hover:bg-blue-700 shadow-md shadow-brand-blue/20">
          + Nueva Empresa
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-brand-dark">{tenants.length}</p>
          <p className="text-xs text-brand-gray">Total empresas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{tenants.filter((t) => t.status === "active").length}</p>
          <p className="text-xs text-brand-gray">Activas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{tenants.filter((t) => t.status === "trial").length}</p>
          <p className="text-xs text-brand-gray">En trial</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-brand-blue">{tenants.reduce((s, t) => s + t.max_professionals, 0)}</p>
          <p className="text-xs text-brand-gray">Profesionales total</p>
        </div>
      </div>

      {/* Created info banner */}
      {createdInfo && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-green-800">Empresa creada! Credenciales enviadas por email.</p>
              <div className="mt-2 text-sm text-green-700 space-y-1">
                <p><strong>Email:</strong> {createdInfo.email}</p>
                <p><strong>contraseña temporal:</strong> <code className="bg-green-200 px-2 py-0.5 rounded">{createdInfo.password}</code></p>
                <p><strong>URL:</strong> {appUrl}/login</p>
              </div>
            </div>
            <button onClick={() => setCreatedInfo(null)} className="text-green-600 hover:text-green-800">✕</button>
          </div>
        </div>
      )}

      {/* Tenant list */}
      {loading ? (
        <div className="text-center py-12 text-brand-gray">Cargando...</div>
      ) : tenants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <EmptyState
            icon={EmptyIcons.business}
            title="No hay empresas registradas aun"
            description="Crea la primera empresa para empezar a operar."
            action={
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-blue text-white text-sm rounded-xl">
                Crear primera empresa
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue font-bold text-sm">
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-brand-dark">{t.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${planColors[t.plan] || ""}`}>
                        {t.plan}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[t.status] || ""}`}>
                        {t.status === "trial" ? `Trial (${daysLeft(t.trial_ends_at)}d)` : t.status}
                      </span>
                    </div>
                    <p className="text-xs text-brand-gray mt-0.5">
                      {t.admin_email} · /{t.slug} · {t.max_professionals} profesionales max
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-xs text-brand-gray">
                    {new Date(t.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {t.trial_ends_at && (
                    <p className={`text-[10px] ${daysLeft(t.trial_ends_at) <= 3 ? "text-red-500 font-bold" : "text-brand-gray"}`}>
                      Expira: {new Date(t.trial_ends_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    </p>
                  )}
                  {t.status === "trial" && daysLeft(t.trial_ends_at) <= 10 && (
                    <button className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded hover:bg-orange-200">
                      Enviar recordatorio
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-end">
                    <button
                      onClick={() => openContact(t)}
                      title="Ver contacto del dueño"
                      className="px-2.5 py-1.5 bg-gray-100 text-brand-gray text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Contacto
                    </button>
                    <button
                      onClick={() => openEdit(t)}
                      title="Editar empresa"
                      className="px-2.5 py-1.5 bg-gray-100 text-brand-gray text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => openDelete(t)}
                      title="Eliminar empresa (permanente)"
                      className="px-2.5 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Eliminar
                    </button>
                    <button
                      onClick={() => openEnterPreview(t)}
                      className="px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-blue/90 transition-colors"
                    >
                      Entrar →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-dark mb-1">Nueva Empresa</h2>
            <p className="text-sm text-brand-gray mb-5">Se creara un admin con contraseña temporal y se le enviara email</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-brand-gray block mb-1">Nombre de la empresa *</label>
                  <input type="text" required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") })}
                    placeholder="Ej: Mi Negocio Premium"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Slug (URL) *</label>
                  <input type="text" required value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="mi-negocio"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">RUT Empresa</label>
                  <input type="text" value={form.rut_empresa}
                    onChange={(e) => setForm({ ...form, rut_empresa: e.target.value })}
                    placeholder="76.123.456-7"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Email admin *</label>
                  <input type="email" required value={form.admin_email}
                    onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                    placeholder="admin@empresa.cl"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Nombre admin</label>
                  <input type="text" value={form.admin_name}
                    onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                    placeholder="Juan Perez"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Telefono</label>
                  <input type="text" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Direccion</label>
                  <input type="text" value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Calle 123, Ciudad"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Logo (URL)</label>
                  <input type="url" value={form.logo_url}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Pagina web</label>
                  <input type="url" value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://miempresa.cl"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Redes sociales</label>
                  <input type="text" value={form.social_media}
                    onChange={(e) => setForm({ ...form, social_media: e.target.value })}
                    placeholder="@instagram, facebook.com/..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Dias de prueba</label>
                  <input type="number" min={1} max={365} value={form.trial_days}
                    onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
                    placeholder="15"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-brand-gray block mb-1">Plan</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "basic", label: "Basic", desc: "1 prof · $8.900/mes" },
                      { key: "starter", label: "Starter", desc: "3 prof · $29.990/mes" },
                      { key: "pro", label: "Pro", desc: "8 prof · $49.990/mes" },
                      { key: "enterprise", label: "Enterprise", desc: "Ilimitado · $189.990/mes" },
                    ].map((p) => (
                      <button key={p.key} type="button" onClick={() => setForm({ ...form, plan: p.key })}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${form.plan === p.key ? "border-brand-blue bg-brand-blue/5" : "border-gray-200 hover:border-gray-300"}`}>
                        <p className="text-sm font-bold text-brand-dark">{p.label}</p>
                        <p className="text-[10px] text-brand-gray">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-brand-gray block mb-1">
                    Cantidad de profesionales (opcional)
                  </label>
                  <input type="number" min={1} value={form.max_professionals}
                    onChange={(e) => setForm({ ...form, max_professionals: e.target.value })}
                    placeholder="Usar el default del plan"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none" />
                  <p className="text-[10px] text-brand-gray mt-1">
                    Solo Superadmin: permite desacoplar el limite de profesionales del plan elegido (ej. Pro con 1-2 profesionales, o Basic con 10). Dejar vacio usa el default del plan.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3 text-xs text-brand-blue">
                Se generara una contraseña temporal y se enviara por email al admin. Trial de {form.trial_days || 15} dias incluido.
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={creating || !form.name || !form.slug || !form.admin_email}
                  className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creando...</>
                  ) : "Crear Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ver contacto del dueño (Punto de Pablo, 25-sep) */}
      {viewingContact && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingContact(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-brand-dark">Contacto — {viewingContact.name}</h2>
              <button onClick={() => setViewingContact(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {loadingContact ? (
              <p className="text-sm text-brand-gray text-center py-6">Cargando...</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Dueño / admin</p>
                  <p className="text-brand-dark font-medium">{viewingContact.admin_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Email</p>
                  <p className="text-brand-dark">{viewingContact.admin_email || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Telefono</p>
                  <p className="text-brand-dark">{viewingContact.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Direccion</p>
                  <p className="text-brand-dark">{viewingContact.address || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">RUT empresa</p>
                  <p className="text-brand-dark">{viewingContact.rut_empresa || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Pagina web</p>
                  <p className="text-brand-dark">{viewingContact.website || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Redes sociales</p>
                  <p className="text-brand-dark">{viewingContact.social_media || "—"}</p>
                </div>
                {viewingContact.counts && (
                  <div className="pt-3 border-t grid grid-cols-2 gap-2 text-xs text-brand-gray">
                    <p>{viewingContact.counts.clients} clientes</p>
                    <p>{viewingContact.counts.appointments} citas</p>
                    <p>{viewingContact.counts.transactions} transacciones</p>
                    <p>{viewingContact.counts.profiles} usuarios</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editar empresa (Punto de Pablo, 25-sep) */}
      {editingTenant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditingTenant(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-dark mb-4">Editar — {editingTenant.name}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-brand-gray block mb-1">Nombre de la empresa</label>
                <input type="text" value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-gray block mb-1">Nombre admin</label>
                <input type="text" value={editForm.admin_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, admin_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-gray block mb-1">Email admin</label>
                <input type="email" value={editForm.admin_email || ""}
                  onChange={(e) => setEditForm({ ...editForm, admin_email: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-gray block mb-1">Telefono</label>
                <input type="text" value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Plan</label>
                  <select value={editForm.plan || ""} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="basic">Basic</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-gray block mb-1">Estado</label>
                  <select value={editForm.status || ""} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="trial">Trial</option>
                    <option value="active">Activa</option>
                    <option value="suspended">Suspendida</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-brand-gray block mb-1">Max. profesionales</label>
                <input type="number" min={1} value={editForm.max_professionals ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, max_professionals: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <button onClick={() => setEditingTenant(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {savingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Eliminar empresa — permanente, para limpiar empresas ficticias/de prueba
          (Punto de Pablo, 25-sep). Exige escribir el nombre exacto para confirmar. */}
      {deletingTenant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeletingTenant(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-red-600 mb-2">Eliminar empresa</h2>
            <p className="text-sm text-brand-gray mb-3">
              Esto borra <strong>permanentemente</strong> "{deletingTenant.tenant.name}" y todos sus datos
              {deletingTenant.counts && (
                <> — {deletingTenant.counts.clients} clientes, {deletingTenant.counts.appointments} citas,{" "}
                {deletingTenant.counts.transactions} transacciones, {deletingTenant.counts.profiles} usuarios</>
              )}. No se puede deshacer.
            </p>
            <label className="text-xs font-medium text-brand-gray block mb-1">
              Escribe <strong>{deletingTenant.tenant.name}</strong> para confirmar
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setDeletingTenant(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={doDelete}
                disabled={deleting || deleteConfirmText !== deletingTenant.tenant.name}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista previa antes de entrar a operar como el negocio (Punto de Pablo, 25-sep) */}
      {enteringTenant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !entering && setEnteringTenant(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue font-bold text-sm shrink-0">
                {(enteringTenant.name || "").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-brand-dark leading-tight">{enteringTenant.name}</h2>
                <p className="text-xs text-brand-gray">/{enteringTenant.slug}</p>
              </div>
            </div>

            {loadingEnterPreview ? (
              <p className="text-sm text-brand-gray text-center py-6">Cargando vista previa...</p>
            ) : (
              <div className="space-y-3 text-sm mb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${planColors[enteringTenant.plan] || ""}`}>
                    {enteringTenant.plan}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[enteringTenant.status] || ""}`}>
                    {enteringTenant.status === "trial" ? `Trial (${daysLeft(enteringTenant.trial_ends_at)}d)` : enteringTenant.status}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-brand-gray uppercase font-medium">Dueño / admin</p>
                  <p className="text-brand-dark">{enteringTenant.admin_name || "—"} · {enteringTenant.admin_email || "—"}</p>
                </div>
                {enteringTenant.counts && (
                  <div className="pt-3 border-t grid grid-cols-2 gap-2 text-xs text-brand-gray">
                    <p>{enteringTenant.counts.clients} clientes</p>
                    <p>{enteringTenant.counts.appointments} citas</p>
                    <p>{enteringTenant.counts.transactions} transacciones</p>
                    <p>{enteringTenant.counts.profiles} usuarios</p>
                  </div>
                )}
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-brand-blue">
                  Vas a entrar a operar como "{enteringTenant.name}". Veras y podras modificar sus datos (clientes, citas, caja, etc.) hasta que salgas del modo Superadmin.
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setEnteringTenant(null)} disabled={entering}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmEnter} disabled={entering || loadingEnterPreview}
                className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {entering ? "Entrando..." : "Entrar a operar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
