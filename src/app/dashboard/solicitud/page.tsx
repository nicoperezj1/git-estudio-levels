"use client";

import { useEffect, useState } from "react";
import { Plus, X, Send } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, Panel, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

interface Supply { id: string; name: string; stock: number; min_stock: number; category?: string | null; product_type?: string | null }
interface Other { name: string; stock: string; qty: string }

// Solicitud de insumos (recepcion / administrador): se despliegan todos los insumos con sus existencias y se indica
// cuanto comprar. Le llega por correo al administrador y queda en su Dashboard hasta que la borre.
export default function SolicitudPage() {
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Other[]>([]);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const tid = () => {
    if (tenant?.id) return tenant.id;
    try { return JSON.parse(localStorage.getItem("tenant_override") || "{}").tenantId || ""; } catch { return ""; }
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = tid();
    fetch(`/api/products${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json())
      .then((d) => setSupplies((Array.isArray(d) ? d : []).filter((p: Supply) => p.product_type === "supply")))
      .catch(() => setSupplies([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const today = new Date().toLocaleDateString("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const filledSupplies = supplies.filter((s) => Number(qty[s.id]) > 0);
  const filledOthers = others.filter((o) => o.name.trim() && Number(o.qty) > 0);
  const canSend = filledSupplies.length + filledOthers.length > 0 && !sending;

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/solicitudes-insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tid() || undefined,
          notes,
          items: [
            ...filledSupplies.map((s) => ({ productId: s.id, toBuy: Number(qty[s.id]) })),
            ...filledOthers.map((o) => ({ name: o.name, currentStock: o.stock === "" ? null : Number(o.stock), toBuy: Number(o.qty) })),
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "No se pudo enviar la solicitud", "error"); return; }
      showToast(
        data.emailSent ? "Solicitud enviada al correo del administrador" : "Solicitud guardada. No se pudo enviar el correo, pero el administrador la verá en su Dashboard.",
        data.emailSent ? "success" : "info"
      );
      setQty({}); setOthers([]); setNotes("");
    } finally { setSending(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 md:space-y-6 p-3 md:p-8 animate-fade-in">
      <PageHeader title="Solicitud de insumos" subtitle={`Indica qué insumos necesitas y cuánto. ${today.charAt(0).toUpperCase()}${today.slice(1)}.`} />

      <Panel title="Insumos" subtitle="Existencias actuales y cantidad a solicitar">
        {loading ? (
          <Spinner />
        ) : supplies.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-gray">Todavía no hay insumos. El administrador los marca como "Insumo" en Inventario, o puedes agregarlos abajo como otro producto.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid grid-cols-[1fr_90px_130px] items-center gap-3 pb-2 text-[11px] font-semibold uppercase leading-tight tracking-wide text-brand-gray">
              <span>Insumo</span><span className="text-center">Existencias</span><span className="text-center">Cantidad a solicitar</span>
            </div>
            {supplies.map((s) => {
              const low = s.stock <= s.min_stock;
              return (
                <div key={s.id} className="grid grid-cols-[1fr_90px_130px] items-center gap-3 py-2.5">
                  <span className="min-w-0 text-sm text-brand-dark">
                    <span className="block truncate">{s.name}</span>
                    {s.category && <span className="text-[11px] text-brand-gray">{s.category}</span>}
                  </span>
                  <span className={`text-center text-sm tabular-nums ${low ? "font-bold text-red-500" : "text-brand-gray"}`}>
                    {s.stock}{low && <span className="block text-[10px] font-semibold">bajo</span>}
                  </span>
                  <input type="number" min={0} step={1} inputMode="numeric" placeholder="0" value={qty[s.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [s.id]: e.target.value })}
                    className={`${inputClass} !py-1.5 text-center tabular-nums`} />
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Otros productos" subtitle="Algo que no está en la lista">
        <div className="space-y-2">
          {others.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] items-center gap-2">
              <input type="text" placeholder="Nombre del producto" value={o.name} onChange={(e) => setOthers(others.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className={`${inputClass} !py-1.5`} />
              <input type="number" min={0} placeholder="Hay" value={o.stock} onChange={(e) => setOthers(others.map((x, k) => (k === i ? { ...x, stock: e.target.value } : x)))} className={`${inputClass} !py-1.5 text-center`} aria-label="Existencias" />
              <input type="number" min={1} placeholder="Solicitar" value={o.qty} onChange={(e) => setOthers(others.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} className={`${inputClass} !py-1.5 text-center`} aria-label="Cantidad a solicitar" />
              <button type="button" onClick={() => setOthers(others.filter((_, k) => k !== i))} aria-label="Quitar" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-gray hover:bg-red-50 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setOthers([...others, { name: "", stock: "", qty: "" }])} className={`${ghostButton} !px-3 !py-1.5 text-xs`}>
            <Plus className="h-3.5 w-3.5" /> Agregar otro producto
          </button>
        </div>
      </Panel>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Nota (opcional)</label>
        <input type="text" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: urgente, falta para el fin de semana" className={inputClass} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-brand-gray">Se envía por correo al administrador y queda en su Dashboard.</p>
        <button onClick={send} disabled={!canSend} className={primaryButton}>
          <Send className="h-4 w-4" /> {sending ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
