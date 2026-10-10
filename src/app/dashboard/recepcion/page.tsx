"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { todayInChile } from "@/lib/utils";

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  client: { name: string; phone: string | null } | null;
  barber: { name: string } | null;
  services: Array<{ service: { name: string } }>;
}

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

export default function RecepcionPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();

  const today = todayInChile();

  // Appointment times are stored as Chile local time WITHOUT a timezone (e.g.
  // "2026-09-01T15:00:00"). Feeding that to `new Date(...).toLocaleTimeString` made the
  // browser re-apply an offset and show 12:00 instead of 15:00 (the -3h shift Nico
  // reported). Read the HH:MM straight from the string instead, same approach the
  // calendar already uses.
  const formatApptTime = (isoLike: string): string => {
    const m = isoLike?.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "";
  };

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
    try {
      const t = getActiveTenantId();
      const params = t ? `&tenantId=${t}` : "";
      const res = await fetch(`/api/appointments?date=${today}${params}`);
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
    fetchAppointments();

    // Clock update every second
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(fetchAppointments, 30000);

    // Supabase realtime subscription
    const supabase = createClient();
    const channel = supabase
      .channel("appointments-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        fetchAppointments();
      })
      .subscribe();

    return () => {
      clearInterval(clockInterval);
      clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  const updateStatus = async (id: string, status: string) => {
    if (status === "cancelled") {
      const ok = await confirm({
        title: "Cancelar cita",
        message: "Estas seguro de que quieres cancelar esta cita?",
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

    // Notify barber when client arrives (status = in_progress)
    if (status === "in_progress") {
      const appt = appointments.find((a) => a.id === id);
      if (appt) {
        await fetch("/api/notifications/client-arrived", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: id,
            clientName: appt.client?.name || "Cliente",
            barberName: appt.barber?.name || "",
          }),
        });
        showToast(`${appt.barber?.name} fue notificado`, "success");
      }
    } else {
      showToast("Estado actualizado", "success");
    }

    fetchAppointments();
  };

  const inProgress = appointments.filter((a: any) => a.status === "in_progress");
  const upcoming = appointments.filter((a: any) => a.status === "scheduled" || a.status === "confirmed");
  const completed = appointments.filter((a: any) => a.status === "completed");

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 bg-gray-50 min-h-screen">
      {/* Header with Clock */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-3xl md:text-5xl font-bold text-gray-900 tabular-nums">
            {currentTime.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-lg text-gray-500">
            {currentTime.toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={fetchAppointments}
          className="px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 shadow-sm">
          Actualizar
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* En Atencion */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">En Atencion</h2>
            {inProgress.length === 0 ? (
              <p className="text-gray-400">No hay citas en atencion</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inProgress.map((a: any) => (
                  <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 shadow border-l-4 border-yellow-400">
                    <p className="font-bold text-lg">{a.client?.name || "-"}</p>
                    <p className="text-sm text-gray-500">Profesional: {a.barber?.name || "-"}</p>
                    <p className="text-sm text-gray-500">Servicios: {a.services?.map((s: any) => s.service?.name).join(", ") || "-"}</p>
                    <button onClick={() => updateStatus(a.id, "completed")}
                      className="mt-3 w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                      Terminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Proximas Citas */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Proximas Citas</h2>
            {upcoming.length === 0 ? (
              <p className="text-gray-400">No hay proximas citas</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map((a: any) => (
                  <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex justify-between items-start">
                      <span className="text-lg font-bold text-indigo-600">{formatApptTime(a.start_time)}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || ""}`}>
                        {statusLabels[a.status] || a.status}
                      </span>
                    </div>
                    <p className="font-medium mt-1">{a.client?.name || "-"}</p>
                    <p className="text-sm text-gray-500">Profesional: {a.barber?.name || "-"}</p>
                    <p className="text-sm text-gray-500">Servicios: {a.services?.map((s: any) => s.service?.name).join(", ") || "-"}</p>
                    {a.client?.phone && (
                      <p className="text-sm text-gray-400">Tel: {a.client.phone}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {a.status === "scheduled" && (
                        <button onClick={() => updateStatus(a.id, "confirmed")}
                          className="flex-1 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
                          Confirmar
                        </button>
                      )}
                      {a.status === "confirmed" && (
                        <button onClick={() => updateStatus(a.id, "in_progress")}
                          className="flex-1 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">
                          Iniciar
                        </button>
                      )}
                      <button onClick={() => updateStatus(a.id, "cancelled")}
                        className="flex-1 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Completadas Hoy */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Completadas Hoy</h2>
            {completed.length === 0 ? (
              <p className="text-gray-400">No hay citas completadas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {completed.map((a: any) => (
                  <div key={a.id} className="bg-white rounded-lg px-4 py-2 shadow text-sm">
                    <span className="font-medium">{a.client?.name || "-"}</span>
                    <span className="text-gray-400 ml-2">({a.barber?.name || "-"})</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
