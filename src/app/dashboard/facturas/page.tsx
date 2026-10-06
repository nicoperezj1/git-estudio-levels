"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";

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
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Facturas Digitales</h1>

      {/* Upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
        <h3 className="font-bold text-gray-800 mb-3">Subir Factura</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Descripcion *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Compra productos Agosto"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Monto</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Opcional"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="purchase">Compra</option>
              <option value="expense">Gasto</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div>
            <label className={`block w-full py-2 text-center rounded-lg text-sm font-medium cursor-pointer transition-colors ${
              uploading || !description ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}>
              {uploading ? "Subiendo..." : "Seleccionar Archivo"}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleUpload}
                disabled={uploading || !description} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b">
          <h3 className="font-bold text-gray-800">Facturas Cargadas ({invoices.length})</h3>
        </div>
        {loading ? <Spinner /> : invoices.length === 0 ? (
          <p className="p-6 text-center text-gray-400">Sin facturas</p>
        ) : (
          <div className="divide-y">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{inv.description}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(inv.created_at).toLocaleDateString("es-CL")} ·
                    {typeLabels[inv.type] || inv.type}
                    {inv.amount ? ` · ${formatCurrency(Number(inv.amount))}` : ""}
                    {inv.uploaded_by_profile ? ` · ${inv.uploaded_by_profile.name}` : ""}
                  </p>
                </div>
                <a href={inv.file_url} target="_blank"
                  className="px-3 py-1.5 border border-indigo-300 text-indigo-600 text-xs rounded-lg hover:bg-indigo-50">
                  Ver archivo
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
