"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { PageHeader, Panel, inputClass, primaryButton } from "@/components/ui/premium";

interface Invoice {
  id: string;
  type: string;
  description: string;
  amount: number | null;
  file_url: string;
  file_name: string | null;
  created_at: string;
  uploaded_by_profile: { name: string } | null;
}

export default function FacturasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("purchase");
  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/invoices");
    setInvoices(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !description) {
      showToast("Agrega una descripcion primero", "error");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", description);
    formData.append("amount", amount);
    formData.append("type", type);

    const res = await fetch("/api/invoices", { method: "POST", body: formData });
    setUploading(false);
    if (res.ok) {
      showToast("Factura subida", "success");
      setDescription("");
      setAmount("");
      e.target.value = "";
      fetchData();
    } else {
      showToast("Error al subir", "error");
    }
  };

  const typeLabels: Record<string, string> = { purchase: "Compra", expense: "Gasto", other: "Otro" };

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 md:space-y-6 md:p-8 animate-fade-in">
      <PageHeader title="Facturas Digitales" subtitle="Sube y guarda tus facturas y comprobantes." />

      {/* Upload */}
      <Panel title="Subir factura">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray">Descripción *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Compra productos Agosto" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray">Monto</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Opcional" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="purchase">Compra</option>
              <option value="expense">Gasto</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <label className={`${primaryButton} cursor-pointer ${uploading || !description ? "pointer-events-none opacity-40" : ""}`}>
            {uploading ? "Subiendo..." : "Seleccionar archivo"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleUpload}
              disabled={uploading || !description} className="hidden" />
          </label>
        </div>
      </Panel>

      {/* List */}
      <Panel title={`Facturas cargadas (${invoices.length})`} flush>
        {loading ? <Spinner /> : invoices.length === 0 ? (
          <p className="p-6 text-center text-sm text-brand-gray">Sin facturas</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-brand-blue/[0.04] md:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-dark">{inv.description}</p>
                  <p className="mt-0.5 text-xs text-brand-gray">
                    {new Date(inv.created_at).toLocaleDateString("es-CL")} · {typeLabels[inv.type] || inv.type}
                    {inv.amount ? ` · ${formatCurrency(Number(inv.amount))}` : ""}
                    {inv.uploaded_by_profile ? ` · ${inv.uploaded_by_profile.name}` : ""}
                  </p>
                </div>
                <a href={inv.file_url} target="_blank"
                  className="flex-shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5">
                  Ver archivo
                </a>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
