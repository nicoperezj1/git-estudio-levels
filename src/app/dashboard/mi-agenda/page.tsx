"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency, todayInChile } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, EmptyIcons } from "@/components/ui/empty-state";
import { PushNotificationButton } from "@/components/push-notifications";
import { buildConfirmWhatsAppUrl } from "@/lib/whatsapp-confirm";
import Link from "next/link";

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  client: { id?: string; name: string; phone: string | null } | null;
  services: Array<{ price: number; service: { name: string; duration: number } }>;
}

interface Block {
  id: string;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

interface Barber {
  id: string;
  name: string;
}

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  in_progress: "En Atencion",
  completed: "Completada",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
};

// Read HH:MM straight from the stored timestamp string, WITHOUT timezone conversion.
// In this app times are stored as UTC that already holds Chile local time (same
// convention the calendar uses). Using new Date(...).toLocaleTimeString() re-applied the
// UTC-3 offset and shifted every hour back 3h (13:00 shown as 10:00) — that was the bug.
const hhmm = (ts: string | null | undefined): string =>
  ts?.match(/(\d{2}:\d{2})/)?.[1] || "";

export default function MiAgendaPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState("");
  const [date, setDate] = useState(todayInChile());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientName: "",
    clientPhone: "",
    serviceId: "",
    date: todayInChile(),
    time: "10:00",
  });
  const [services, setServices] = useState<Array<{ id: string; name: string; duration: number; price: number }>>([]);
  const [creating, setCreating] = useState(false);
  const [clientSuggestions, setClientSuggestions] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [blockForm, setBlockForm] = useState({
    date: todayInChile(),
    allDay: true,
    startTime: "10:00",
    endTime: "21:00",
    reason: "",
  });
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { user, isAtLeast } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const q = t ? `?tenantId=${t}` : "";
    fetch(`/api/barberos${q}`).then((r) => r.json()).then((data) => {
      let list = Array.isArray(data) ? data : [];
      // Un administrador que tambien atiende clientes sale PRIMERO y ya seleccionado, para
      // ver su propia agenda sin tener que buscarse en la lista.
      const me = user?.id ? list.find((b: Barber & { also_attends_clients?: boolean }) => b.id === user.id) : null;
      const attendsClients = !!me && (me.role === "barber" || !!(me as any).also_attends_clients);
      if (me && attendsClients) list = [me, ...list.filter((b: Barber) => b.id !== me.id)];
      setBarbers(list);
      if (user?.role === "barber" && user?.id) {
        setSelectedBarber(user.id);
      } else if (list.length > 0) {
        setSelectedBarber(list[0].id);
      }
    });
    fetch(`/api/services${q}`).then((r) => r.json()).then((data) => {
      setServices(Array.isArray(data) ? data : []);
    });
  }, [user, tenantLoading, tenant?.id]);

  const fetchData = async () => {
    if (!selectedBarber) return;
    setLoading(true);
    const [apptRes, blockRes] = await Promise.all([
      fetch(`/api/barber/agenda?barberId=${selectedBarber}&date=${date}`),
      fetch(`/api/barber/blocks?barberId=${selectedBarber}&month=${date.slice(0, 7)}`),
    ]);
    const appts = await apptRes.json();
    setAppointments(Array.isArray(appts) ? appts : []);
    setBlocks(await blockRes.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedBarber, date]);

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    showToast("Estado actualizado", "success");
    fetchData();
  };

  const searchClients = async (query: string) => {
    if (query.length < 2) { setClientSuggestions([]); return; }
    const res = await fetch(`/api/clients?search=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    setClientSuggestions(Array.isArray(data?.clients) ? data.clients : Array.isArray(data) ? data : []);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.clientName.trim() || !createForm.serviceId || !selectedBarber) return;
    setCreating(true);

    const service = services.find((s) => s.id === createForm.serviceId);
    const duration = service?.duration || 45;
    const startTime = `${createForm.date}T${createForm.time}:00`;

    const res = await fetch("/api/public/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceIds: [createForm.serviceId],
        barberId: selectedBarber,
        date: createForm.date,
        startTime,
        clientName: createForm.clientName.trim(),
        clientPhone: createForm.clientPhone.trim() || null,
        clientEmail: null,
      }),
    });

    setCreating(false);
    if (res.ok) {
      showToast("Cita creada", "success");
      setShowCreateModal(false);
      setCreateForm({ clientName: "", clientPhone: "", serviceId: "", date, time: "10:00" });
      setClientSuggestions([]);
      fetchData();
    } else {
      const data = await res.json();
      showToast(data.error || "Error al crear cita", "error");
    }
  };

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/barber/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: selectedBarber,
        date: blockForm.date,
        allDay: blockForm.allDay,
        startTime: blockForm.allDay ? null : blockForm.startTime,
        endTime: blockForm.allDay ? null : blockForm.endTime,
        reason: blockForm.reason,
      }),
    });
    showToast("Dia bloqueado", "success");
    setShowBlockModal(false);
    setBlockForm({ date: todayInChile(), allDay: true, startTime: "10:00", endTime: "21:00", reason: "" });
    fetchData();
  };

  const removeBlock = async (id: string) => {
    const ok = await confirm({
      title: "Desbloquear",
      message: "Quieres eliminar este bloqueo?",
      confirmText: "Si, desbloquear",
      variant: "warning",
    });
    if (!ok) return;
    await fetch(`/api/barber/blocks?id=${id}`, { method: "DELETE" });
    showToast("Bloqueo eliminado", "success");
    fetchData();
  };

  const todayBlocks = blocks.filter((b) => b.date === date);
  const isBlockedToday = todayBlocks.some((b) => b.all_day);

  return (
    <div className="p-3 md:p-6 space-y-2.5 md:space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg md:text-2xl font-bold">Mi Agenda</h1>
        <button
          onClick={() => setShowBlockModal(true)}
          className="px-3 py-1.5 md:py-2 bg-red-600 text-white text-xs md:text-sm rounded-lg hover:bg-red-700"
        >
          Bloquear Dia
        </button>
      </div>

      {/* Turn on push alerts for new appointments (Vicente's request). Permanent, unlike
          the one-time banner. */}
      <div>
        <PushNotificationButton />
      </div>

      {/* Selector de profesional: solo admin/super_admin y solo si hay mas de uno (con uno solo se entiende). */}
      {isAtLeast("admin") && barbers.length > 1 && (
        <select
          value={selectedBarber}
          onChange={(e) => setSelectedBarber(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
        >
          {barbers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      {/* Date navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg p-2 shadow">
        <button onClick={() => changeDate(-1)} className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-base">←</button>
        <div className="relative text-center">
          <p className="font-bold first-letter:uppercase">
            {new Date(date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {/* Tocar la fecha abre el selector de fecha (el input va encima, invisible). */}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Elegir fecha" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </div>
        <button onClick={() => changeDate(1)} className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-base">→</button>
      </div>

      {/* Blocked day indicator */}
      {isBlockedToday && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-red-700">Dia bloqueado</p>
            <p className="text-sm text-red-500">{todayBlocks[0]?.reason || "Sin motivo"}</p>
          </div>
          <button
            onClick={() => removeBlock(todayBlocks[0].id)}
            className="text-xs text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-100"
          >
            Desbloquear
          </button>
        </div>
      )}

      {/* Partial blocks */}
      {todayBlocks.filter((b) => !b.all_day).map((b) => (
        <div key={b.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-yellow-700">Bloqueado: {b.start_time} - {b.end_time}</p>
            <p className="text-sm text-yellow-500">{b.reason || "Sin motivo"}</p>
          </div>
          <button
            onClick={() => removeBlock(b.id)}
            className="text-xs text-yellow-600 border border-yellow-300 px-2 py-1 rounded hover:bg-yellow-100"
          >
            Quitar
          </button>
        </div>
      ))}

      {/* Appointments */}
      {loading ? (
        <Spinner />
      ) : appointments.length === 0 && !isBlockedToday ? (
        <EmptyState
          icon={EmptyIcons.agendaEmpty}
          title="Sin citas para hoy"
          description="Tu agenda de hoy esta libre."
          size="lg"
        />
      ) : (
        <div className="space-y-2">
          {appointments.map((a: any) => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-bold text-indigo-600">
                      {hhmm(a.start_time)}
                    </span>
                    <span className="text-xs text-gray-400">
                      - {hhmm(a.end_time)}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{a.client?.name || "Sin cliente"}</p>
                  {a.client?.phone && (
                    <a href={`tel:${a.client.phone}`} className="text-xs text-blue-500 hover:underline">
                      {a.client.phone}
                    </a>
                  )}
                  <p className="text-sm text-gray-500">
                    {a.services?.map((s: any) => s.service?.name).join(", ")}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || ""}`}>
                  {statusLabels[a.status] || a.status}
                </span>
              </div>

              {/* Una sola fila: WhatsApp, ficha del cliente y la accion de estado. */}
              <div className="flex gap-2 mt-2">
              {/* Acceso rapido: WhatsApp de confirmacion y ficha del cliente, sin ir a buscarlo. */}
              {(() => {
                const waUrl = buildConfirmWhatsAppUrl({
                  clientName: a.client?.name,
                  phone: a.client?.phone,
                  businessName: tenant?.name,
                  professionalName: barbers.find((b) => b.id === selectedBarber)?.name,
                  serviceNames: (a.services || []).map((s: any) => s.service?.name),
                  date,
                  time: a.start_time,
                });
                if (!waUrl && !a.client?.id) return null;
                return (
                  <div className="contents">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 lg:py-2 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1da851]"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.63-1.218A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.239 0-4.332-.726-6.033-1.96l-.424-.316-2.745.722.734-2.682-.347-.553A9.963 9.963 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                        </svg>
                        WhatsApp
                      </a>
                    )}
                    {a.client?.id && (
                      <Link
                        href={`/dashboard/clientes/${a.client.id}`}
                        className="flex-1 inline-flex items-center justify-center py-2.5 lg:py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Ficha
                      </Link>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="contents">
                {a.status === "scheduled" && (
                  <button onClick={() => updateStatus(a.id, "confirmed")}
                    className="flex-1 py-2.5 lg:py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200">
                    Confirmar
                  </button>
                )}
                {a.status === "confirmed" && (
                  <button onClick={() => updateStatus(a.id, "in_progress")}
                    className="flex-1 py-2.5 lg:py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200">
                    Iniciar
                  </button>
                )}
                {a.status === "in_progress" && (
                  <button onClick={() => updateStatus(a.id, "completed")}
                    className="flex-1 py-2.5 lg:py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                    Completar
                  </button>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-sm shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">Bloquear Horario</h2>
            <form onSubmit={handleBlock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input type="date" value={blockForm.date}
                  onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" required />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allDay" checked={blockForm.allDay}
                  onChange={(e) => setBlockForm({ ...blockForm, allDay: e.target.checked })}
                  className="rounded" />
                <label htmlFor="allDay" className="text-sm">Todo el dia</label>
              </div>
              {!blockForm.allDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Desde</label>
                    <input type="time" value={blockForm.startTime}
                      onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                    <input type="time" value={blockForm.endTime}
                      onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
                <input type="text" value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Ej: Evento, dia libre, capacitacion..."
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowBlockModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Bloquear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAB - Quick create appointment */}
      {!showCreateModal && !showBlockModal && (
        <button
          onClick={() => { setCreateForm({ ...createForm, date }); setShowCreateModal(true); }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-brand-blue text-white rounded-full shadow-lg shadow-brand-blue/30 flex items-center justify-center text-2xl z-30 active:scale-95 hover:bg-blue-700 transition-all"
        >
          +
        </button>
      )}

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-dark mb-4">Crear Cita Rapida</h2>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              {/* Client name with autocomplete */}
              <div className="relative">
                <label className="block text-xs font-medium text-brand-gray mb-1">Cliente</label>
                <input
                  type="text"
                  value={createForm.clientName}
                  onChange={(e) => { setCreateForm({ ...createForm, clientName: e.target.value }); searchClients(e.target.value); }}
                  placeholder="Nombre del cliente"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                />
                {clientSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-32 overflow-y-auto">
                    {clientSuggestions.map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => { setCreateForm({ ...createForm, clientName: c.name, clientPhone: c.phone || "" }); setClientSuggestions([]); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-brand-light border-b border-gray-50 last:border-0">
                        <p className="font-medium text-brand-dark">{c.name}</p>
                        {c.phone && <p className="text-xs text-brand-gray">{c.phone}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Telefono (opcional)</label>
                <input
                  type="tel"
                  value={createForm.clientPhone}
                  onChange={(e) => setCreateForm({ ...createForm, clientPhone: e.target.value })}
                  placeholder="+56 9 1234 5678"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                />
              </div>

              {/* Service */}
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Servicio</label>
                <select
                  value={createForm.serviceId}
                  onChange={(e) => setCreateForm({ ...createForm, serviceId: e.target.value })}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                >
                  <option value="">Seleccionar servicio</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.duration}min)</option>
                  ))}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Fecha</label>
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Hora</label>
                  <input
                    type="time"
                    value={createForm.time}
                    onChange={(e) => setCreateForm({ ...createForm, time: e.target.value })}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); setClientSuggestions([]); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-brand-gray hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={creating || !createForm.clientName.trim() || !createForm.serviceId}
                  className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Creando...</>
                  ) : "Crear Cita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
