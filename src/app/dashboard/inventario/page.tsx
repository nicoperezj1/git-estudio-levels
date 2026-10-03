"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { useLedgerEnabled } from "@/components/finance/professional-ledger-view";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, Panel, Segmented, ghostButton, primaryButton } from "@/components/ui/premium";
import { BASE_PRODUCT_CATEGORIES, PRODUCT_TYPE_LABELS } from "@/lib/product-categories";

interface Product {
  id: string;
  name: string;
  sku: string;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
  product_type?: "sale" | "supply" | null;
  category?: string | null;
  sales_commission_type?: "percent" | "fixed" | null;
  sales_commission_value?: number | null;
}

interface Movement {
  id: string;
  type: string;
  quantity: number;
  notes: string;
  created_at: string;
  product: { name: string } | null;
  barber: { name: string } | null;
}

const movementTypeLabels: Record<string, string> = {
  in: "Entrada",
  out_use: "Uso",
  adjustment: "Ajuste",
};

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", barcode: "", cost: "", price: "", stock: "", min_stock: "", comType: "", comValue: "", hadCom: false, productType: "sale", category: "",
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  // Filtro por tipo y categorias (base + propias del negocio).
  const [typeFilter, setTypeFilter] = useState<"all" | "sale" | "supply">("all");
  const [categories, setCategories] = useState<string[]>([...BASE_PRODUCT_CATEGORIES]);
  const loadCategories = () => {
    const t = getActiveTenantId();
    fetch(`/api/product-categories${t ? `?tenantId=${t}` : ""}`).then((r) => r.json()).then((d) => { if (Array.isArray(d.categories)) setCategories(d.categories); }).catch(() => {});
  };
  const addCategory = async () => {
    const name = (prompt("Nombre de la nueva categoría:") || "").trim();
    if (!name) return;
    const res = await fetch("/api/product-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tenantId: getActiveTenantId() || undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || "No se pudo agregar la categoría", "error"); return; }
    setCategories((c) => (c.some((x) => x.toLowerCase() === name.toLowerCase()) ? c : [...c, name]));
    setProductForm((f) => ({ ...f, category: name }));
  };
  const [movementForm, setMovementForm] = useState({
    product_id: "", type: "in", quantity: "", notes: "",
  });
  const [pendingMovements, setPendingMovements] = useState<Movement[]>([]);
  const [adminPin, setAdminPin] = useState("");
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const { effectiveRole } = useAuth();
  // La comision por venta solo se muestra si el negocio usa el libro de movimientos (Configuracion).
  const ledgerOn = !!useLedgerEnabled();

  // Receptionist: inventory is read-only. Any change (create/edit/delete product,
  // register movement) must be unlocked with the admin PIN first. An admin/owner sees
  // it unlocked as before.
  const pinLocked = effectiveRole === "receptionist";
  const [unlocked, setUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPinInput, setUnlockPinInput] = useState("");
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const canEdit = !pinLocked || unlocked;

  // Ask for the admin PIN before running a mutating action, unless already unlocked.
  const guard = (action: () => void) => {
    if (canEdit) { action(); return; }
    setPendingAction(() => action);
    setUnlockPinInput("");
    setShowUnlockModal(true);
  };

  const verifyUnlockPin = async () => {
    const res = await fetch("/api/pos/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: unlockPinInput }),
    });
    const data = await res.json();
    if (!data.valid) {
      showToast(data.error || "PIN incorrecto", "error");
      return;
    }
    setUnlocked(true);
    setShowUnlockModal(false);
    showToast("Desbloqueado por el administrador", "success");
    const action = pendingAction;
    setPendingAction(null);
    if (action) action();
  };

  // Resolve the active business (context or super_admin override). Products MUST be
  // created with a tenant_id, otherwise they're invisible everywhere (POS included).
  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const q = t ? `?tenantId=${t}` : "";
      const [productsRes, movementsRes, pendingRes] = await Promise.all([
        fetch(`/api/products${q}`),
        fetch(`/api/inventario/movements?status=approved${t ? `&tenantId=${t}` : ""}`),
        fetch(`/api/inventario/movements?status=pending${t ? `&tenantId=${t}` : ""}`),
      ]);
      const prodData = await productsRes.json();
      const movData = await movementsRes.json();
      const pendData = await pendingRes.json();
      setProducts(Array.isArray(prodData) ? prodData : []);
      setMovements(Array.isArray(movData) ? movData : []);
      setPendingMovements(Array.isArray(pendData) ? pendData : []);
    } catch (err) {
      console.error("Error fetching inventory:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchData();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const lowStockProducts = products.filter((p) => p.stock <= p.min_stock);
  // Sin tipo (producto de antes o columna aun no creada) = Venta, como siempre.
  const shownProducts = products.filter((p) => typeFilter === "all" || (p.product_type || "sale") === typeFilter);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeTenantId = getActiveTenantId();
    const payload = {
      name: productForm.name,
      sku: productForm.sku || null,
      barcode: productForm.barcode || null,
      cost: parseFloat(productForm.cost),
      price: productForm.productType === "supply" ? 0 : parseFloat(productForm.price),
      stock: parseInt(productForm.stock),
      min_stock: parseInt(productForm.min_stock),
      tenantId: activeTenantId || undefined,
      product_type: productForm.productType,
      category: productForm.category || null,
      // Comision por venta: solo se manda si se eligio una, o para borrar una que ya tenia.
      ...(productForm.comType
        ? { sales_commission_type: productForm.comType, sales_commission_value: parseFloat(productForm.comValue) || 0 }
        : productForm.hadCom ? { sales_commission_type: null, sales_commission_value: 0 } : {}),
    };

    if (editingProductId) {
      await fetch(`/api/products/${editingProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("Producto actualizado", "success");
    } else {
      // Don't block on the client-side tenant here. If the tenant context hasn't loaded
      // yet (a slow /api/tenant call), activeTenantId is "" and we used to refuse right
      // here with "no se pudo identificar el negocio" — even though the user IS logged
      // in. The server resolves the tenant from the session as a fallback, so let it
      // try; it still fails loudly (and we surface that) if it truly can't.
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Error al crear producto", "error");
        return;
      }
      showToast("Producto creado", "success");
    }
    setShowProductModal(false);
    setEditingProductId(null);
    setProductForm({ name: "", sku: "", barcode: "", cost: "", price: "", stock: "", min_stock: "", comType: "", comValue: "", hadCom: false, productType: "sale", category: "" });
    fetchData();
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/inventario/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: movementForm.product_id,
        type: movementForm.type,
        quantity: parseInt(movementForm.quantity),
        notes: movementForm.notes,
        requireApproval: true,
      }),
    });
    const data = await res.json();
    if (data.needsApproval) {
      showToast("Movimiento pendiente de aprobacion", "info");
    } else {
      showToast("Movimiento registrado", "success");
    }
    setShowMovementModal(false);
    setMovementForm({ product_id: "", type: "in", quantity: "", notes: "" });
    fetchData();
  };

  const openNewProduct = () => guard(() => {
    setEditingProductId(null);
    setProductForm({ name: "", sku: "", barcode: "", cost: "", price: "", stock: "", min_stock: "", comType: "", comValue: "", hadCom: false, productType: "sale", category: "" });
    setShowProductModal(true);
  });
  const openEditProduct = (p: Product) => guard(() => {
    setProductForm({ name: p.name, sku: p.sku || "", barcode: (p as any).barcode || "", cost: String(p.cost), price: String(p.price), stock: String(p.stock), min_stock: String(p.min_stock), comType: p.sales_commission_type || "", comValue: p.sales_commission_value ? String(Number(p.sales_commission_value)) : "", hadCom: !!p.sales_commission_type, productType: (p.product_type as "sale" | "supply") || "sale", category: p.category || "" });
    setEditingProductId(p.id);
    setShowProductModal(true);
  });
  const deleteProduct = (p: Product) => guard(async () => {
    if (!confirm(`Eliminar "${p.name}"?`)) return;
    await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) });
    showToast("Producto eliminado", "success");
    fetchData();
  });
  const decideMovement = async (id: string, action: "approve" | "reject") => {
    const res = await fetch("/api/inventario/movements", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movementId: id, action, adminPin }),
    });
    const data = await res.json();
    if (data.success) { showToast(action === "approve" ? "Movimiento aprobado" : "Movimiento rechazado", "success"); fetchData(); }
    else showToast(data.error || "Error", "error");
  };
  const typeBadge = (t: string) =>
    t === "in" ? "bg-green-100 text-green-700" : t === "out_use" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
  // Tabla compacta: celdas angostas y texto un punto mas chico.
  const th = "whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-gray";
  const thR = th.replace("text-left", "text-right");
  const thC = th.replace("text-left", "text-center");
  const td = "px-3 py-2 text-[13px] text-brand-dark";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6 animate-fade-in">
      <PageHeader
        title="Inventario"
        subtitle="Productos de venta e insumos del negocio."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pinLocked && !unlocked && (
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">Solo lectura · pide PIN para editar</span>
            )}
            <button onClick={() => guard(() => setShowMovementModal(true))} className={`${ghostButton} !px-3 !py-2 text-sm`}>
              Registrar movimiento
            </button>
            <button onClick={openNewProduct} className={`${primaryButton} !px-3 !py-2 text-sm`}>
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Nuevo producto
            </button>
          </div>
        }
      />

      {/* Stock bajo: una sola franja */}
      {lowStockProducts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={2} />
          <span className="font-semibold text-amber-800">Stock bajo</span>
          {lowStockProducts.map((p) => (
            <span key={p.id} className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{p.name} ({p.stock}/{p.min_stock})</span>
          ))}
        </div>
      )}

      {/* Productos */}
      <Panel
        flush
        title="Productos"
        subtitle={loading ? undefined : `${shownProducts.length} producto${shownProducts.length === 1 ? "" : "s"}`}
        action={<Segmented size="sm" value={typeFilter} onChange={(v) => setTypeFilter(v)} options={[{ value: "all", label: "Todos" }, { value: "sale", label: "Venta" }, { value: "supply", label: "Insumos" }]} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={th}>Producto</th>
                <th className={th}>Tipo</th>
                <th className={thR}>Costo</th>
                <th className={thR}>Precio</th>
                <th className={thC}>Stock / Mín.</th>
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6}><Spinner /></td></tr>
              ) : shownProducts.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-brand-gray">No hay productos en esta vista.</td></tr>
              ) : shownProducts.map((p) => {
                const supply = (p.product_type || "sale") === "supply";
                const low = p.stock <= p.min_stock;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-brand-blue/[0.04]">
                    <td className={td}>
                      <span className="font-semibold">{p.name}</span>
                      {p.sku && <span className="ml-2 text-[11px] text-brand-gray">{p.sku}</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${supply ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                        {PRODUCT_TYPE_LABELS[(supply ? "supply" : "sale") as "sale" | "supply"]}
                      </span>
                      {p.category && <span className="ml-1.5 text-[11px] text-brand-gray">{p.category}</span>}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{formatCurrency(Number(p.cost))}</td>
                    <td className={`${td} text-right tabular-nums`}>{supply ? <span className="text-gray-300">—</span> : formatCurrency(Number(p.price))}</td>
                    <td className={`${td} whitespace-nowrap text-center tabular-nums`}>
                      <span className={low ? "font-bold text-red-600" : "font-semibold"}>{p.stock}</span>
                      <span className="text-[11px] text-brand-gray"> / {p.min_stock}</span>
                      {low && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">bajo</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEditProduct(p)} aria-label={`Editar ${p.name}`} title="Editar"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-gray hover:bg-brand-blue/10 hover:text-brand-blue">
                          <Pencil className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                        <button onClick={() => deleteProduct(p)} aria-label={`Eliminar ${p.name}`} title="Eliminar"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-gray hover:bg-red-50 hover:text-red-500">
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Movimientos pendientes de aprobacion */}
      {pendingMovements.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-yellow-300 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-yellow-200 bg-yellow-50 px-4 py-2.5">
            <h3 className="text-sm font-bold text-yellow-800">Pendientes de aprobación ({pendingMovements.length})</h3>
            <input type="password" placeholder="PIN Admin" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} maxLength={6}
              className="w-24 rounded-lg border border-yellow-200 bg-white px-2 py-1 text-center text-sm" />
          </div>
          <div className="divide-y divide-gray-100">
            {pendingMovements.map((m: any) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBadge(m.type)}`}>{movementTypeLabels[m.type] || m.type}</span>
                    <span className="font-semibold text-brand-dark">{m.product?.name}</span>
                    <span className="text-brand-gray">x{m.quantity}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-brand-gray">{new Date(m.created_at).toLocaleString("es-CL")}{m.notes && ` · ${m.notes}`}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => decideMovement(m.id, "approve")} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">Aprobar</button>
                  <button onClick={() => decideMovement(m.id, "reject")} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos recientes */}
      <Panel flush title="Movimientos recientes" subtitle={movements.length > 0 ? `${movements.length} registro${movements.length === 1 ? "" : "s"}` : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Producto</th>
                <th className={th}>Tipo</th>
                <th className={thC}>Cant.</th>
                <th className={th}>Profesional</th>
                <th className={th}>Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-brand-gray">Sin movimientos todavía.</td></tr>
              ) : movements.map((m: any) => (
                <tr key={m.id} className="transition-colors hover:bg-brand-blue/[0.04]">
                  <td className={`${td} whitespace-nowrap tabular-nums text-brand-gray`}>{new Date(m.created_at).toLocaleDateString("es-CL")}</td>
                  <td className={`${td} font-medium`}>{m.product?.name || "-"}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBadge(m.type)}`}>{movementTypeLabels[m.type] || m.type}</span>
                  </td>
                  <td className={`${td} text-center tabular-nums`}>{m.quantity}</td>
                  <td className={`${td} max-w-[140px] truncate`}>{m.barber?.name || "-"}</td>
                  <td className={`${td} max-w-[220px] truncate text-brand-gray`}>{m.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* New Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in my-4">
            <h2 className="text-lg font-bold mb-4">{editingProductId ? "Editar Producto" : "Nuevo Producto"}</h2>
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" required value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input type="text" value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Codigo de Barras</label>
                <input type="text" value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  placeholder="Escanea o ingresa manualmente"
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de producto</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["sale", "supply"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setProductForm({ ...productForm, productType: t })}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${productForm.productType === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {PRODUCT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {productForm.productType === "sale" ? "Aparece en el Punto de Venta para venderlo." : "No se vende: es de uso del negocio y se pide en la Solicitud de insumos."}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select value={productForm.category}
                  onChange={(e) => { if (e.target.value === "__new") addCategory(); else setProductForm({ ...productForm, category: e.target.value }); }}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  {effectiveRole !== "receptionist" && <option value="__new">+ Nueva categoría…</option>}
                </select>
              </div>
              {/* Un insumo no se vende: solo tiene costo (lo que pagas por el). El precio es solo para productos de venta. */}
              <div className={`grid gap-4 ${productForm.productType === "sale" ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Costo</label>
                  <input type="number" required min="0" step="1" value={productForm.cost}
                    onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
                {productForm.productType === "sale" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                    <input type="number" required min="0" step="1" value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
                  <input type="number" required min="0" step="1" value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Minimo</label>
                  <input type="number" required min="0" step="1" value={productForm.min_stock}
                    onChange={(e) => setProductForm({ ...productForm, min_stock: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              {ledgerOn && productForm.productType === "sale" && (
                <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comisión por venta</label>
                  <p className="mb-2 text-xs text-gray-500">Lo que gana el profesional que vende este producto. Es la misma para todo el negocio.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={productForm.comType} onChange={(e) => setProductForm({ ...productForm, comType: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Sin comisión</option>
                      <option value="percent">% del precio</option>
                      <option value="fixed">Monto fijo por unidad</option>
                    </select>
                    <input type="number" min="0" step={productForm.comType === "percent" ? "0.5" : "1"} disabled={!productForm.comType}
                      value={productForm.comValue} onChange={(e) => setProductForm({ ...productForm, comValue: e.target.value })}
                      placeholder={productForm.comType === "percent" ? "Ej: 10 (%)" : "Ej: 1000 ($)"}
                      className="w-full border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  disabled={!productForm.name || (productForm.productType === "sale" && !productForm.price) || !productForm.cost || !productForm.stock || !productForm.min_stock}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin PIN unlock modal (receptionist trying to modify inventory) */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl animate-scale-in text-center">
            <h2 className="text-lg font-bold mb-1">PIN de administrador</h2>
            <p className="text-xs text-brand-gray mb-4">Ingresa el PIN del administrador para modificar el inventario.</p>
            <input
              type="password"
              inputMode="numeric"
              value={unlockPinInput}
              onChange={(e) => setUnlockPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") verifyUnlockPin(); }}
              placeholder="••••"
              maxLength={6}
              autoFocus
              className="w-full border rounded-xl px-3 py-2.5 text-center text-lg tracking-widest mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowUnlockModal(false); setPendingAction(null); }}
                className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={verifyUnlockPin} disabled={!unlockPinInput}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">Desbloquear</button>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">Registrar Movimiento</h2>
            <form onSubmit={handleCreateMovement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                <select required value={movementForm.product_id}
                  onChange={(e) => setMovementForm({ ...movementForm, product_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="">Seleccionar producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={movementForm.type}
                  onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="in">Entrada</option>
                  <option value="out_use">Uso</option>
                  <option value="adjustment">Ajuste</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input type="number" required min="1" value={movementForm.quantity}
                  onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={movementForm.notes}
                  onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  disabled={!movementForm.product_id || !movementForm.quantity || parseInt(movementForm.quantity) <= 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
