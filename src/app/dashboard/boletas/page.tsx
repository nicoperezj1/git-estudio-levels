"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";

interface Transaction {
  id: string;
  total: number;
  created_at: string;
  receipt_sent: boolean;
  client: { name: string; email: string | null } | null;
  barber: { name: string } | null;
  items: Array<{ description: string; total: number }>;
}

export default function BoletasPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState("");
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const res = await fetch(`/api/finanzas?type=income${t ? `&tenantId=${t}` : ""}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const sendReceipt = async (transactionId: string) => {
    const email = emails[transactionId];
    if (!email) return;
    setSending((prev) => ({ ...prev, [transactionId]: true }));
    try {
      const res = await fetch("/api/boletas/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, email }),
      });
      if (res.ok) {
        showToast("Boleta enviada exitosamente", "success");
        fetchTransactions();
      }
    } catch (err) {
      console.error("Error sending receipt:", err);
      showToast("Error al enviar boleta", "error");
    } finally {
      setSending((prev) => ({ ...prev, [transactionId]: false }));
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Boletas</h1>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre de cliente..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Fecha</th>
              <th className="text-left p-4 font-medium text-gray-600">Cliente</th>
              <th className="text-left p-4 font-medium text-gray-600">Detalle</th>
              <th className="text-right p-4 font-medium text-gray-600">Total</th>
              <th className="text-center p-4 font-medium text-gray-600">Estado</th>
              <th className="text-left p-4 font-medium text-gray-600">Enviar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6}><Spinner /></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">No hay transacciones</td></tr>
            ) : transactions.filter((t: any) => !searchFilter || (t.client?.name || "").toLowerCase().includes(searchFilter.toLowerCase())).map((t: any) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="p-4">{new Date(t.created_at).toLocaleDateString("es-CL")}</td>
                <td className="p-4">{t.client?.name || "-"}</td>
                <td className="p-4">{t.items?.map((i: any) => i.description).join(", ") || "-"}</td>
                <td className="p-4 text-right font-medium">{formatCurrency(Number(t.total))}</td>
                <td className="p-4 text-center">
                  {t.receipt_sent ? (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Enviada
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <input type="email" placeholder="email@ejemplo.com"
                      value={emails[t.id] || ""}
                      onChange={(e) => setEmails({ ...emails, [t.id]: e.target.value })}
                      className="border rounded-lg px-2 py-1 text-sm w-48" />
                    <button onClick={() => sendReceipt(t.id)}
                      disabled={!emails[t.id] || sending[t.id]}
                      className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {sending[t.id] ? "..." : "Enviar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
