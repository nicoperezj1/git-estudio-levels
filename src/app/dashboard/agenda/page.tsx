"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { todayInChile } from "@/lib/utils";

interface Appointment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  barber_id: string;
  status: string;
  notes: string;
  client: { id: string; name: string; phone: string | null } | null;
  barber: { id: string; name: string } | null;
  services: Array<{ id: string; price: number; service: { name: string; price: number; duration: number } }>;
}

interface Client { id: string; name: string; }
interface Barber { id: string; name: string; }
interface Service { id: string; name: string; price: number; duration: number; }

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  in_progress: "En Atencion",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No Asistio",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-gray-100 text-gray-700",
};

export default function AgendaPage() {
  const [date, setDate] = useState(todayInChile());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [barberFilter, setBarberFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    client_id: "", barber_id: "", time: "09:00", services: [] as string[], notes: "",
  });
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();

  // Resolve tenant from context or localStorage override (reliable on Vercel).
  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const params = t ? `&tenantId=${t}` : "";
      const res = await fetch(`/api/appointments?date=${date}${params}`);
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const q = t ? `?tenantId=${t}` : "";
    Promise.all([
      fetch(`/api/barberos${q}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/clients${q}`).then((r) => r.json()).catch(() => ({ clients: [] })),
      fetch(`/api/services${q}`).then((r) => r.json()).catch(() => []),
    ]).then(([b, c, s]) => {
      setBarbers(Array.isArray(b) ? b : []);
      setClients(Array.isArray(c?.clients) ? c.clients : Array.isArray(c) ? c : []);
      setServices(Array.isArray(s) ? s : []);
    });
  }, [tenantLoading, tenant?.id]);

  useEffect(() => {
    if (tenantLoading) return;
    fetchAppointments();
  }, [date, tenantLoading, tenant?.id]);

  const filteredAppointments = barberFilter
    ? appointments.filter((a: any) => a.barber_id === barberFilter)
    : appointments;

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const updateStatus = async (id: string, status: string) => {
    if (status === "cancelled") {
      const ok = await confirm({
        title: "Cancelar cita",
        message: "Estas seguro de que quieres cancelar esta cita? Esta accion no se puede deshacer.",
        confirmText: "Si, cancelar",
        variant: "danger",
      });
      if (!ok) return;
    }

    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    showToast("Estado actualizado", "success");
    fetchAppointments();
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      services: prev.services.includes(serviceId)
        ? prev.services.filter((s) => s !== serviceId)
        : [...prev.services, serviceId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: formData.client_id,
        barberId: formData.barber_id,
        date,
        startTime: `${date}T${formData.time}:00`,
        serviceIds: formData.services,
        notes: formData.notes,
        tenantId: getActiveTenantId() || undefined,
      }),
    });
    showToast("Cita agendada exitosamente", "success");
    setShowModal(false);
    setFormData({ client_id: "", barber_id: "", time: "09:00", services: [], notes: "" });
    fetchAppointments();
  };

  const timeSlots: string[] = [];
  for (let h = 9; h <= 20; h++) {
    timeSlots.push(`${h.toString().padStart(2, "0")}:00`);
    if (h < 20 || true) timeSlots.push(`${h.toString().padStart(2, "0")}:30`);
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Agenda</h1>
        <button onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          Nueva Cita
        </button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => changeDate(-1)}
          className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">&larr;</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border rounded-lg px-3 py-2" />
        <button onClick={() => changeDate(1)}
          className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">&rarr;</button>
        <select value={barberFilter} onChange={(e) => setBarberFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 ml-4">
          <option value="">Todos los profesionales</option>
          {barbers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Appointments */}
      {loading ? (
        <Spinner />
      ) : filteredAppointments.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay citas para este dia</p>
      ) : (
        <div className="space-y-3">
          {filteredAppointments.map((a: any) => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-indigo-600">{a.start_time?.match(/(\d{2}:\d{2})/)?.[1] || ""}</span>
                  <span className="font-medium text-gray-900">{a.client?.name || "-"}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || "bg-gray-100 text-gray-700"}`}>
                    {statusLabels[a.status] || a.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Profesional: {a.barber?.name || "-"} | Servicios: {a.services?.map((s: any) => s.service?.name).join(", ") || "-"}
                </p>
              </div>
              <div className="flex gap-2">
                {a.status === "scheduled" && (
                  <button onClick={() => updateStatus(a.id, "confirmed")}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">Confirmar</button>
                )}
                {a.status === "confirmed" && (
                  <button onClick={() => updateStatus(a.id, "in_progress")}
                    className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">Iniciar</button>
                )}
                {a.status === "in_progress" && (
                  <button onClick={() => updateStatus(a.id, "completed")}
                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Completar</button>
                )}
                {(a.status === "scheduled" || a.status === "confirmed") && (
                  <button onClick={() => updateStatus(a.id, "cancelled")}
                    className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Cancelar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Appointment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-lg shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">Nueva Cita</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select required value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="">Seleccionar cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
                <select required value={formData.barber_id}
                  onChange={(e) => setFormData({ ...formData, barber_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="">Seleccionar profesional</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                <select value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  {timeSlots.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Servicios</label>
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                      className={`px-3 py-1 rounded-lg text-sm ${
                        formData.services.includes(s.id)
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  disabled={!formData.client_id || !formData.barber_id || formData.services.length === 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
