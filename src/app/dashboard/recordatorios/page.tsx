"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { chileDateOffset } from "@/lib/utils";

interface WhatsAppLink {
  appointmentId: string;
  clientName: string;
  phone: string;
  time: string;
  service: string;
  barber: string;
  whatsappUrl: string;
}

export default function RecordatoriosPage() {
  const [links, setLinks] = useState<WhatsAppLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Punto 4 (Nico): antes esta pagina solo mostraba "manana" sin forma de elegir otro
  // dia. Por defecto sigue siendo manana (comportamiento previo), pero ahora se puede
  // adelantar trabajo (ej. gestionar lunes/martes en sabado) con el selector de fecha.
  const [selectedDate, setSelectedDate] = useState(chileDateOffset(1));
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

  const fetchLinks = async () => {
    setLoading(true);
    const t = getActiveTenantId();
    const res = await fetch(`/api/cron/reminders/whatsapp?date=${selectedDate}${t ? `&tenantId=${t}` : ""}`);
    setLinks(await res.json());
    setLoading(false);
  };

  useEffect(() => { if (!tenantLoading) fetchLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantLoading, tenant?.id, selectedDate]);

  // Etiqueta amigable para el dia elegido, calculada en el navegador a partir del
  // string YYYY-MM-DD (evita el corrimiento de un dia que da new Date("YYYY-MM-DD")
  // al interpretarse como UTC medianoche).
  const dateLabel = (() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const todayStr = chileDateOffset(0);
    const tomorrowStr = chileDateOffset(1);
    if (selectedDate === todayStr) return "de hoy";
    if (selectedDate === tomorrowStr) return "de mañana";
    const formatted = new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(Date.UTC(y, m - 1, d, 12)));
    return `del ${formatted}`;
  })();

  const triggerEmailReminders = async () => {
    setSending(true);
    const res = await fetch("/api/cron/reminders");
    const data = await res.json();
    setSending(false);
    showToast(`${data.emailsSent || 0} emails enviados`, "success");
  };

  const openWhatsApp = (url: string) => {
    window.open(url, "_blank");
  };

  const openAllWhatsApp = () => {
    links.forEach((link, i) => {
      setTimeout(() => window.open(link.whatsappUrl, "_blank"), i * 1500);
    });
    showToast(`Abriendo ${links.length} conversaciones`, "info");
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Recordatorios</h1>
          <p className="text-gray-500 text-sm">Citas {dateLabel} - notifica a tus clientes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerEmailReminders}
            disabled={sending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {sending ? "Enviando..." : "Enviar Emails"}
          </button>
          {links.length > 0 && (
            <button
              onClick={openAllWhatsApp}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar todos por WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Automatico:</strong> Los emails de recordatorio se envian automaticamente 24h antes de cada cita (via Vercel Cron).
          Desde aqui puedes enviar WhatsApp manualmente o re-disparar emails.
        </p>
      </div>

      {/* Selector de dia - Punto 4: permite gestionar recordatorios de cualquier dia,
          no solo "mañana" (ej. adelantar lunes/martes en sabado). */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Ver citas de:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedDate(chileDateOffset(0))}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedDate === chileDateOffset(0) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Hoy
          </button>
          <button
            onClick={() => setSelectedDate(chileDateOffset(1))}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedDate === chileDateOffset(1) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Mañana
          </button>
          <button
            onClick={() => setSelectedDate(chileDateOffset(2))}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedDate === chileDateOffset(2) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Pasado mañana
          </button>
        </div>
      </div>

      {/* Selected day's appointments */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b">
          <h2 className="font-bold text-gray-800">Citas {dateLabel} ({links.length})</h2>
        </div>
        {loading ? (
          <Spinner />
        ) : links.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-lg">No hay citas agendadas para ese dia</p>
          </div>
        ) : (
          <div className="divide-y">
            {links.map((link) => (
              <div key={link.appointmentId} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-indigo-600">{link.time}</span>
                    <span className="font-medium text-gray-900">{link.clientName}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {link.service} · Profesional: {link.barber} · Tel: {link.phone}
                  </p>
                </div>
                <button
                  onClick={() => openWhatsApp(link.whatsappUrl)}
                  className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
