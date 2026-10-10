"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

interface WaitlistEntry {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  preferred_date: string;
  status: string;
  notified_at: string | null;
  created_at: string;
  service: { name: string } | null;
  barber: { name: string } | null;
}

const statusLabels: Record<string, string> = {
  waiting: "En espera",
  notified: "Notificado",
  booked: "Agendo",
  expired: "Expirado",
};

const statusColors: Record<string, string> = {
  waiting: "bg-yellow-100 text-yellow-700",
  notified: "bg-blue-100 text-blue-700",
  booked: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-500",
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/waitlist?status=all");
    const data = await res.json();
    setEntries(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const notifyClient = async (id: string, type: "email" | "whatsapp") => {
    const res = await fetch("/api/waitlist/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistId: id, type }),
    });
    const data = await res.json();

    if (data.success) {
      if (type === "whatsapp" && data.url) {
        window.open(data.url, "_blank");
      }
      showToast("Cliente notificado", "success");
      fetchData();
    } else {
      showToast(data.error || "Error al notificar", "error");
    }
  };

  const markAs = async (id: string, status: string) => {
    await fetch("/api/waitlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    showToast("Estado actualizado", "success");
    fetchData();
  };

  const waiting = entries.filter((e) => e.status === "waiting");
  const others = entries.filter((e) => e.status !== "waiting");

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Lista de Espera</h1>
        <p className="text-gray-500 text-sm">Clientes esperando hora. Notificalos cuando se libere un slot.</p>
      </div>

      {/* Waiting */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-800">En Espera ({waiting.length})</h2>
        </div>
        {loading ? <Spinner /> : waiting.length === 0 ? (
          <p className="p-6 text-center text-gray-400">No hay clientes en espera</p>
        ) : (
          <div className="divide-y">
            {waiting.map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-medium text-gray-900">{e.client_name}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                    <span>Fecha: {new Date(e.preferred_date).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}</span>
                    {e.service && <span>· {(e.service as any).name}</span>}
                    {e.barber && <span>· {(e.barber as any).name}</span>}
                    {e.client_phone && <span>· {e.client_phone}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {e.client_phone && (
                    <button onClick={() => notifyClient(e.id, "whatsapp")}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
                      WhatsApp
                    </button>
                  )}
                  {e.client_email && (
                    <button onClick={() => notifyClient(e.id, "email")}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
                      Email
                    </button>
                  )}
                  <button onClick={() => markAs(e.id, "booked")}
                    className="px-3 py-1.5 border border-green-300 text-green-700 text-xs rounded-lg hover:bg-green-50">
                    Agendo
                  </button>
                  <button onClick={() => markAs(e.id, "expired")}
                    className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:bg-gray-50">
                    Expirar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {others.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-4 border-b">
            <h2 className="font-bold text-gray-500">Historial ({others.length})</h2>
          </div>
          <div className="divide-y">
            {others.slice(0, 20).map((e) => (
              <div key={e.id} className="p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[e.status] || ""}`}>
                    {statusLabels[e.status] || e.status}
                  </span>
                  <span className="text-gray-700">{e.client_name}</span>
                  <span className="text-gray-400">
                    {new Date(e.preferred_date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                  </span>
                </div>
                {e.notified_at && (
                  <span className="text-xs text-gray-400">
                    Notificado {new Date(e.notified_at).toLocaleDateString("es-CL")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
