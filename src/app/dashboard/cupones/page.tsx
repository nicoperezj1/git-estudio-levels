"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, Panel, tableStyles as ts, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

interface Coupon {
  id: string;
  code: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  valid_until: string | null;
  active: boolean;
}

export default function CuponesPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "", description: "", type: "percentage", value: "",
    min_purchase: "", max_uses: "", valid_until: "",
  });
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const { confirm } = useConfirm();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const res = await fetch(`/api/cupones${t ? `?tenantId=${t}` : ""}`);
      const data = await res.json();
      setCoupons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching coupons:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const deleteCoupon = async (c: Coupon) => {
    const ok = await confirm({
      title: "Eliminar cupon",
      message: `Eliminar el cupon "${c.code}"? Esta accion no se puede deshacer.`,
      confirmText: "Eliminar",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/cupones/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      setCoupons((prev) => prev.filter((x) => x.id !== c.id));
      showToast("Cupon eliminado", "success");
    } else {
      showToast("No se pudo eliminar el cupon", "error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await fetch(`/api/cupones/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: formData.description,
          discount_type: formData.type,
          discount_value: parseFloat(formData.value),
          min_purchase: parseFloat(formData.min_purchase) || null,
          max_uses: parseInt(formData.max_uses) || null,
          valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null,
        }),
      });
      showToast("Cupon actualizado", "success");
    } else {
      await fetch("/api/cupones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: getActiveTenantId(),
          code: formData.code,
          description: formData.description,
          discountType: formData.type,
          discountValue: parseFloat(formData.value),
          minPurchase: parseFloat(formData.min_purchase) || null,
          maxUses: parseInt(formData.max_uses) || null,
          validUntil: formData.valid_until || null,
        }),
      });
      showToast("Cupon creado exitosamente", "success");
    }
    setShowModal(false);
    setEditingId(null);
    setFormData({ code: "", description: "", type: "percentage", value: "", min_purchase: "", max_uses: "", valid_until: "" });
    fetchCoupons();
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setFormData({
      code: c.code,
      description: c.description || "",
      type: c.discount_type,
      value: String(c.discount_value),
      min_purchase: c.min_purchase ? String(c.min_purchase) : "",
      max_uses: c.max_uses ? String(c.max_uses) : "",
      valid_until: c.valid_until ? c.valid_until.split("T")[0] : "",
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditingId(null);
    setFormData({ code: "", description: "", type: "percentage", value: "", min_purchase: "", max_uses: "", valid_until: "" });
    setShowModal(true);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 md:space-y-6 md:p-8 animate-fade-in">
      <PageHeader
        title="Cupones"
        subtitle="Códigos de descuento para tus clientes."
        actions={<button onClick={openNew} className={primaryButton}>Nuevo cupón</button>}
      />

      <Panel flush>
        <div className={ts.wrap}>
        <table className={ts.table}>
          <thead className={ts.thead}>
            <tr>
              <th className={ts.th}>Código</th>
              <th className={ts.th}>Descripción</th>
              <th className={ts.th}>Descuento</th>
              <th className={ts.thRight}>Min. compra</th>
              <th className={ts.thCenter}>Usos</th>
              <th className={ts.th}>Válido hasta</th>
              <th className={ts.thCenter}>Estado</th>
              <th className={ts.thCenter}>Acciones</th>
            </tr>
          </thead>
          <tbody className={ts.tbody}>
            {loading ? (
              <tr><td colSpan={8}><Spinner /></td></tr>
            ) : coupons.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-brand-gray">No hay cupones</td></tr>
            ) : coupons.map((c) => (
              <tr key={c.id} className={ts.tr}>
                <td className={`${ts.td} font-mono font-semibold`}>{c.code}</td>
                <td className={ts.td}>{c.description || "-"}</td>
                <td className={`${ts.td} font-semibold`}>
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : formatCurrency(Number(c.discount_value))}
                </td>
                <td className={`${ts.td} text-right`}>{c.min_purchase ? formatCurrency(Number(c.min_purchase)) : "-"}</td>
                <td className={ts.tdCenter}>{c.used_count}/{c.max_uses || "∞"}</td>
                <td className={ts.td}>
                  {c.valid_until ? new Date(c.valid_until).toLocaleDateString("es-CL") : "Sin límite"}
                </td>
                <td className={ts.tdCenter}>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    c.active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                  }`}>
                    {c.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className={ts.tdCenter}>
                  <div className="flex justify-center gap-2">
                    <button onClick={() => openEdit(c)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-brand-dark hover:border-brand-blue/40">
                      Editar
                    </button>
                    <button onClick={() => deleteCoupon(c)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">{editingId ? "Editar Cupon" : "Nuevo Cupon"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Codigo</label>
                <input type="text" required value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Descripcion</label>
                <input type="text" value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-brand-gray">Tipo</label>
                  <select value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className={inputClass}>
                    <option value="percentage">Porcentaje</option>
                    <option value="fixed_amount">Monto Fijo</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-brand-gray">Valor</label>
                  <input type="number" required min="0" value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-brand-gray">Compra Minima</label>
                  <input type="number" min="0" value={formData.min_purchase}
                    onChange={(e) => setFormData({ ...formData, min_purchase: e.target.value })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-brand-gray">Usos Maximos</label>
                  <input type="number" min="1" value={formData.max_uses}
                    onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                    className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-gray">Valido Hasta</label>
                <input type="date" value={formData.valid_until}
                  onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  className={inputClass} />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowModal(false)}
                  className={ghostButton}>Cancelar</button>
                <button type="submit"
                  disabled={!formData.code.trim() || !formData.value || parseFloat(formData.value) <= 0}
                  className={primaryButton}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
