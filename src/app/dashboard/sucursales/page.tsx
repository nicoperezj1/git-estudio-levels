"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { useTenant } from "@/lib/tenant-context";
import { MoreVertical, MapPin, Phone, Mail, Clock, Pencil, Trash2 } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  open_time: string;
  close_time: string;
  active: boolean;
}

export default function SucursalesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", address: "", phone: "", email: "", open_time: "10:00", close_time: "21:00" });
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  // El superadmin "viendo como" otro negocio debe listar/editar solo ese negocio.
  const tq = tenant?.id ? `?tenantId=${tenant.id}` : "";

  const fetchBranches = async () => {
    setLoading(true);
    const res = await fetch(`/api/branches${tq}`);
    setBranches(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchBranches();
  }, [tenant?.id, tenantLoading]);

  const openNew = () => {
    setEditingBranch(null);
    setForm({ name: "", slug: "", address: "", phone: "", email: "", open_time: "10:00", close_time: "21:00" });
    setShowModal(true);
  };

  const openEdit = (b: Branch) => {
    setEditingBranch(b);
    setForm({
      name: b.name,
      slug: b.slug,
      address: b.address || "",
      phone: b.phone || "",
      email: b.email || "",
      open_time: b.open_time || "10:00",
      close_time: b.close_time || "21:00",
    });
    setShowModal(true);
    setMenuOpen(null);
  };

  const handleDelete = async (b: Branch) => {
    if (!confirm(`Eliminar sucursal "${b.name}"?`)) return;
    await fetch(`/api/branches/${b.id}${tq}`, { method: "DELETE" });
    showToast("Sucursal eliminada", "success");
    fetchBranches();
    setMenuOpen(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingBranch) {
      await fetch(`/api/branches/${editingBranch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tenantId: tenant?.id }),
      });
      showToast("Sucursal actualizada", "success");
    } else {
      await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tenantId: tenant?.id }),
      });
      showToast("Sucursal creada", "success");
    }

    setShowModal(false);
    setEditingBranch(null);
    fetchBranches();
  };

  const bookingBaseUrl = typeof window !== "undefined" ? window.location.origin : "https://re-booking.cl";

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Sucursales</h1>
          <p className="text-brand-gray text-sm">Gestiona tus locales</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90 text-sm font-medium">
          Nueva Sucursal
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 relative">
              {/* 3-dot menu */}
              <div className="absolute top-4 right-4">
                <button onClick={() => setMenuOpen(menuOpen === b.id ? null : b.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-brand-gray">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen === b.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                    <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36">
                      <button onClick={() => openEdit(b)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-dark hover:bg-gray-50">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button onClick={() => handleDelete(b)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mb-3">
                <h3 className="font-bold text-lg text-brand-dark pr-8">{b.name}</h3>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">Activa</span>
              </div>

              <div className="space-y-1.5 text-sm text-brand-gray">
                {b.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{b.address}</span>
                  </div>
                )}
                {b.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{b.phone}</span>
                  </div>
                )}
                {b.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{b.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{b.open_time} – {b.close_time}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t">
                <p className="text-[10px] text-brand-gray mb-1">Link de booking:</p>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded-lg text-brand-blue block truncate border border-gray-100">
                  {bookingBaseUrl}/booking?branch={b.slug}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold text-brand-dark mb-4">
              {editingBranch ? "Editar Sucursal" : "Nueva Sucursal"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Nombre</label>
                <input type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, slug: editingBranch ? form.slug : e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  placeholder="Ej: Sucursal Centro"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Slug (URL)</label>
                <input type="text" required value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="puente-alto"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Direccion</label>
                <input type="text" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Ej: Av. Principal 123, Comuna"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Telefono</label>
                  <input type="text" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Email</label>
                  <input type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Apertura</label>
                  <input type="time" value={form.open_time}
                    onChange={(e) => setForm({ ...form, open_time: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Cierre</label>
                  <input type="time" value={form.close_time}
                    onChange={(e) => setForm({ ...form, close_time: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditingBranch(null); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm">Cancelar</button>
                <button type="submit"
                  disabled={!form.name || !form.slug}
                  className="px-5 py-2.5 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90 disabled:opacity-50 text-sm font-medium">
                  {editingBranch ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
