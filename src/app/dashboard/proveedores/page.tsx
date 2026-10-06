"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, Panel, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";
import { buildSupplierMessage, whatsAppUrl } from "@/lib/supplier-message";

interface Supplier { id: string; name: string; phone: string }
interface Product { id: string; name: string; stock: number; product_type?: string | null; category?: string | null }

// Proveedores (administrador): nombre del comercio y celular a mano; para cotizar se eligen productos del inventario
// (con cantidad) y/o productos nuevos, el mensaje se arma solo (saludo segun la hora) y se abre en WhatsApp.
export default function ProveedoresPage() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ id: "", name: "", phone: "" });
  const [saving, setSaving] = useState(false);

  // Cotizacion
  const [quoteFor, setQuoteFor] = useState<Supplier | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [newProducts, setNewProducts] = useState<Array<{ name: string; qty: string }>>([]);
  const [custom, setCustom] = useState<string | null>(null); // texto editado a mano; null = automatico

  const tid = () => {
    if (tenant?.id) return tenant.id;
    try { return JSON.parse(localStorage.getItem("tenant_override") || "{}").tenantId || ""; } catch { return ""; }
  };
  const tq = () => (tid() ? `?tenantId=${tid()}` : "");

  const load = async () => {
    const [s, p] = await Promise.all([
      fetch(`/api/proveedores${tq()}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/products${tq()}`).then((r) => r.json()).catch(() => []),
    ]);
    setSuppliers(s.suppliers || []);
    setProducts(Array.isArray(p) ? p : []);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantLoading) load(); }, [tenantLoading, tenant?.id]);

  const saveSupplier = async () => {
    setSaving(true);
    try {
      const editing = !!form.id;
      const res = await fetch("/api/proveedores", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id || undefined, name: form.name, phone: form.phone, tenantId: tid() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo guardar", "error"); return; }
      showToast(editing ? "Proveedor actualizado" : "Proveedor agregado", "success");
      setForm({ id: "", name: "", phone: "" });
      await load();
    } finally { setSaving(false); }
  };

  const removeSupplier = async (s: Supplier) => {
    const ok = await confirm({ title: "Quitar proveedor", message: `¿Quitar a ${s.name} de tu lista?`, confirmText: "Quitar", variant: "warning" });
    if (!ok) return;
    const res = await fetch(`/api/proveedores?id=${s.id}${tid() ? `&tenantId=${tid()}` : ""}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo quitar", "error"); return; }
    await load();
  };

  const openQuote = (s: Supplier) => { setQuoteFor(s); setPicked({}); setSearch(""); setNewProducts([]); setCustom(null); };

  const items = products.filter((p) => Number(picked[p.id]) > 0).map((p) => ({ name: p.name, qty: Number(picked[p.id]) }));
  const news = newProducts.filter((n) => n.name.trim() && Number(n.qty) > 0).map((n) => ({ name: n.name, qty: Number(n.qty) }));
  const auto = useMemo(
    () => buildSupplierMessage({ adminName: user?.name || "", businessName: tenant?.name || "", items, newProducts: news }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(items), JSON.stringify(news), user?.name, tenant?.name, quoteFor?.id]
  );
  const message = custom ?? auto;
  const waUrl = quoteFor ? whatsAppUrl(quoteFor.phone, message) : null;
  const canWhatsApp = !!waUrl && items.length + news.length > 0;
  const shown = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl space-y-3 md:space-y-6 p-3 md:p-8 animate-fade-in">
      <PageHeader title="Proveedores" subtitle="Pide cotizaciones por WhatsApp con los productos de tu inventario." />

      <Panel title="Mis proveedores">
        {loading ? (
          <Spinner />
        ) : suppliers.length === 0 ? (
          <p className="py-4 text-center text-sm text-brand-gray">Aún no tienes proveedores. Agrega el primero abajo.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {suppliers.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-brand-dark">{s.name}</p>
                  <p className="text-xs text-brand-gray">{s.phone}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openQuote(s)} className={`${primaryButton} !px-3 !py-1.5 text-xs`}>Cotizar</button>
                  <button onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone })} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>Editar</button>
                  <button onClick={() => removeSupplier(s)} className="px-2 text-xs font-semibold text-red-500 hover:underline">Quitar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={form.id ? "Editar proveedor" : "Nuevo proveedor"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del comercio" className={inputClass} />
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Celular (ej: 9 1234 5678)" className={inputClass} />
          <div className="flex gap-2">
            <button onClick={saveSupplier} disabled={saving || !form.name.trim() || !form.phone.trim()} className={primaryButton}>
              {form.id ? "Guardar" : "Agregar"}
            </button>
            {form.id && <button onClick={() => setForm({ id: "", name: "", phone: "" })} className={ghostButton}>Cancelar</button>}
          </div>
        </div>
      </Panel>

      {quoteFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setQuoteFor(null)}>
          <div className="my-6 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-brand-dark">Cotizar con {quoteFor.name}</h3>
                <p className="text-xs text-brand-gray">{quoteFor.phone}</p>
              </div>
              <button onClick={() => setQuoteFor(null)} aria-label="Cerrar" className="text-brand-gray hover:text-brand-dark"><X className="h-5 w-5" /></button>
            </div>

            <p className="mb-1.5 text-xs font-semibold text-brand-gray">Productos de tu inventario</p>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className={`${inputClass} mb-2 !py-1.5`} />
            <div className="max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
              {shown.length === 0 ? (
                <p className="p-3 text-center text-xs text-brand-gray">Sin productos.</p>
              ) : shown.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-brand-dark">{p.name}{p.product_type === "supply" && <span className="ml-1.5 text-[10px] text-amber-600">insumo</span>}</span>
                  <input type="number" min={0} step={1} inputMode="numeric" placeholder="0" value={picked[p.id] ?? ""}
                    onChange={(e) => setPicked({ ...picked, [p.id]: e.target.value })} className={`${inputClass} !w-20 !py-1 text-center`} aria-label={`Cantidad de ${p.name}`} />
                </div>
              ))}
            </div>

            <p className="mb-1.5 mt-4 text-xs font-semibold text-brand-gray">¿Producto nuevo? Añádelo aquí</p>
            <div className="space-y-2">
              {newProducts.map((n, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_32px] items-center gap-2">
                  <input type="text" placeholder="Nombre del producto" value={n.name} onChange={(e) => setNewProducts(newProducts.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className={`${inputClass} !py-1.5`} />
                  <input type="number" min={1} placeholder="Cant." value={n.qty} onChange={(e) => setNewProducts(newProducts.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} className={`${inputClass} !py-1.5 text-center`} />
                  <button type="button" onClick={() => setNewProducts(newProducts.filter((_, k) => k !== i))} aria-label="Quitar" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-gray hover:bg-red-50 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setNewProducts([...newProducts, { name: "", qty: "" }])} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>
                <Plus className="h-3.5 w-3.5" /> Agregar producto nuevo
              </button>
            </div>

            <div className="mb-1.5 mt-4 flex items-center justify-between">
              <p className="text-xs font-semibold text-brand-gray">Mensaje</p>
              {custom !== null && <button onClick={() => setCustom(null)} className="text-xs font-semibold text-brand-blue hover:underline">Volver al mensaje automático</button>}
            </div>
            <textarea value={message} onChange={(e) => setCustom(e.target.value)} rows={9} className={`${inputClass} font-mono text-[13px] leading-snug`} />

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setQuoteFor(null)} className={ghostButton}>Cerrar</button>
              <button onClick={() => waUrl && window.open(waUrl, "_blank", "noopener")} disabled={!canWhatsApp} className={`${primaryButton} !bg-emerald-600 !bg-none`}>
                <MessageCircle className="h-4 w-4" /> Contactar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
