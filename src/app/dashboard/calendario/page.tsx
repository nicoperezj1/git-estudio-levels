"use client";

import { peakOverlap } from "@/lib/capacity";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency, todayInChile, dateStrOffset } from "@/lib/utils";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { buildConfirmWhatsAppUrl } from "@/lib/whatsapp-confirm";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ChevronLeft, ChevronRight, Plus, CalendarX, Sun, SlidersHorizontal } from "lucide-react";
import { Segmented, primaryButton } from "@/components/ui/premium";
import { useBackToClose } from "@/lib/use-back-to-close";

interface Barber { id: string; name: string; role?: string; also_attends_clients?: boolean; }
interface Service { id: string; name: string; price: number; duration: number; }
interface Client { id: string; name: string; phone?: string | null; email?: string | null; }

interface Appointment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  barber_id: string;
  client: { name: string } | null;
  is_new_client?: boolean;
  barber: { name: string } | null;
  services: Array<{ service: { name: string } }>;
}

const barberColors = [
  { bg: "bg-blue-100", border: "border-l-blue-500", text: "text-blue-800" },
  { bg: "bg-purple-100", border: "border-l-purple-500", text: "text-purple-800" },
  { bg: "bg-green-100", border: "border-l-green-500", text: "text-green-800" },
  { bg: "bg-orange-100", border: "border-l-orange-500", text: "text-orange-800" },
  { bg: "bg-pink-100", border: "border-l-pink-500", text: "text-pink-800" },
  { bg: "bg-cyan-100", border: "border-l-cyan-500", text: "text-cyan-800" },
  { bg: "bg-yellow-100", border: "border-l-yellow-500", text: "text-yellow-800" },
  { bg: "bg-red-100", border: "border-l-red-500", text: "text-red-800" },
  { bg: "bg-indigo-100", border: "border-l-indigo-500", text: "text-indigo-800" },
];

const statusDot: Record<string, string> = {
  scheduled: "bg-yellow-500", confirmed: "bg-blue-500", in_progress: "bg-purple-500", completed: "bg-green-500",
};

// Readable status badge shown INSIDE each appointment block, so the morning
// confirmation state (Pendiente / Confirmado / ...) is visible at a glance on the
// calendar without opening the appointment — this was the main complaint ("apenas se ve").
const statusBadge: Record<string, { label: string; cls: string }> = {
  scheduled:   { label: "Pendiente",   cls: "bg-yellow-100 text-yellow-800" },
  confirmed:   { label: "Confirmado",  cls: "bg-green-100 text-green-800" },
  in_progress: { label: "En atención", cls: "bg-purple-100 text-purple-800" },
  completed:   { label: "Completado",  cls: "bg-gray-200 text-gray-700" },
  no_show:     { label: "No asistió",  cls: "bg-red-100 text-red-700" },
  cancelled:   { label: "Cancelado",   cls: "bg-red-100 text-red-700" },
};

const HOUR_HEIGHT = 64; // px per hour
// Rango por defecto de la grilla (Nico, 25-sep): Pablo pidio poder ver todo el dia
// (antes de las 08:00 y despues de las 21:00 quedaba invisible/inalcanzable). El rango
// reducido se mantiene como default porque es lo que se usa la gran mayoria del tiempo,
// pero ahora es una opcion (ver toggle `fullDay` dentro del componente, mas abajo) en vez
// de un limite fijo — el rango completo cubre las 24 horas.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21;
const FULL_DAY_START_HOUR = 0;
const FULL_DAY_END_HOUR = 24;

// Etiquetas de estado para la vista Lista — mismas usadas antes en la pagina Agenda
// (ahora fusionada aqui), para que se vea igual a como estaba.
const listStatusLabels: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  in_progress: "En Atencion",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No Asistio",
};

const listStatusColors: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-gray-100 text-gray-700",
};

export default function CalendarioPage() {
  // Calendario (grilla por hora) o Lista (como la antigua pagina Agenda, ahora fusionada
  // aqui — ver punto 20 del pedido de Pablo).
  const [view, setView] = useState<"calendario" | "lista">("calendario");
  const [listBarberFilter, setListBarberFilter] = useState("");
  const [date, setDate] = useState(todayInChile());
  // Vista por profesional a 1/3/7 dias (Nico, 28-sep), inspirada en Setmore: al elegir un
  // profesional puntual (en vez de "Todos"), la grilla normal de "una columna por
  // profesional en un solo dia" se reemplaza por "una columna por dia" para ESE
  // profesional, y aparecen los botones 1/3/7 dias. Version simple (primera entrega,
  // a pedido de Nico): solo lectura — click para ver el detalle, sin arrastrar para crear
  // ni mover/redimensionar citas en esta vista todavía (eso sigue solo en la vista normal).
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [rangeDays, setRangeDays] = useState<1 | 3 | 7>(1);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Array<{ id: string; barber_id: string; date: string; all_day: boolean; start_time: string | null; end_time: string | null; reason: string | null; spots?: number | null }>>([]);
  // Each barber's working hours for the currently viewed weekday, keyed by barber id.
  // Used to dim (grey out) the slots OUTSIDE their shift on the grid, so out-of-hours
  // time reads as unavailable at a glance (David's feedback), without needing a manual
  // block there.
  const [schedules, setSchedules] = useState<Record<string, { is_working: boolean; start_time: string | null; end_time: string | null; break_start: string | null; break_end: string | null }>>({});
  const [loading, setLoading] = useState(true);
  // Minutes since midnight for the "current time" line (like Setmore). Refreshed every
  // minute so the line creeps down through the day on its own.
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  // Punto (Nico, 25-sep): Pablo pidio poder ver antes de las 08:00 y despues de las
  // 21:00 — se agrega como opcion (toggle) en vez de cambiar el default, para no hacer
  // la grilla gigante todo el tiempo. START_HOUR/END_HOUR locales (no los modulos
  // DEFAULT_*/FULL_DAY_*) para que toda la grilla, los calculos de posicion y el hover
  // reaccionen al toggle.
  const [fullDay, setFullDay] = useState(false);
  // En celular el calendario se ve por defecto como GRILLA (la misma grilla por hora que en
  // computador, con scroll horizontal). "Tarjetas" es la alternativa en lista, y la eleccion
  // de cada persona se recuerda en su equipo.
  const [mobileGrid, setMobileGrid] = useState(true);
  // Celular: los controles secundarios (vista, profesional, rango) quedan plegados tras "Filtros".
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("calendar_mobile_view");
      if (saved === "tarjetas") setMobileGrid(false);
    } catch {}
  }, []);
  const chooseMobileView = (grid: boolean) => {
    setMobileGrid(grid);
    try { localStorage.setItem("calendar_mobile_view", grid ? "grilla" : "tarjetas"); } catch {}
  };
  // Vista "profesionales agrupados" (opcion del negocio, solo equipos de 2 a 4 personas):
  // el selector 1/3/7 dias tambien aplica a TODOS los profesionales a la vez.
  // Se activa en Configuracion > Calendario (admin). Ver /api/settings/calendar-view.
  const [groupWeekActive, setGroupWeekActive] = useState(false);
  const [rangeBlocks, setRangeBlocks] = useState<Array<{ id: string; barber_id: string; date: string; all_day: boolean; start_time: string | null; end_time: string | null; reason: string | null; spots?: number | null }>>([]);
  const START_HOUR = fullDay ? FULL_DAY_START_HOUR : DEFAULT_START_HOUR;
  const END_HOUR = fullDay ? FULL_DAY_END_HOUR : DEFAULT_END_HOUR;
  // Punto (Nico, 25-sep): tooltip que sigue el cursor mostrando hora (redondeada a 15
  // min) + profesional, para no tener que desplazarse hacia la columna de horas ni hacia
  // el header del profesional para confirmar donde se esta parado.
  const [hoverInfo, setHoverInfo] = useState<{ barberId: string; y: number } | null>(null);
  // Punto (Nico, 25-sep): edicion de bloqueos (antes solo se podian eliminar con la X
  // roja). Al hacer click en un bloqueo se abre este panel con nombre + duracion +
  // eliminar, en vez del toast de solo lectura que habia antes.
  const [editingBlock, setEditingBlock] = useState<{
    id: string; barberId: string; reason: string; allDay: boolean; startTime: string; endTime: string; spots?: number;
  } | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  // Las vacaciones se ven como bloqueos de todo el dia pero se cambian en Mi negocio > Vacaciones.
  const openBlockEditor = (b: any) => {
    if (String(b?.id || "").startsWith("vac-")) { showToast("Son vacaciones del profesional: se cambian en Mi negocio > Vacaciones", "success"); return; }
    setEditingBlock(b);
  };
  // Bloqueo de solo algunos cupos: se dibuja en la parte derecha de la columna, donde queda el cupo libre.
  const partialBlockStyle = (block: any, base: any) => {
    const sp = Number(block?.spots);
    if (slotCap > 1 && !block?.all_day && sp >= 1 && sp < slotCap) {
      const w = (100 / slotCap) * sp;
      return { ...base, left: `calc(${100 - w}% + 2px)`, width: `calc(${w}% - 4px)`, right: "auto" };
    }
    return base;
  };
  const { tenant, loading: tenantLoading } = useTenant();
  const { user, effectiveRole } = useAuth();
  const router = useRouter();

  // A barber should only see their own agenda, not the whole team's.
  const isBarber = (effectiveRole || user?.role) === "barber";

  // Get tenant ID (from context or localStorage override)
  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  // Columns to render.
  // - Barbers see ONLY their own column (their own agenda).
  // - Admins/receptionists see the whole team.
  // Falls back to today's appointment barbers, then to the logged-in user, so there's
  // always at least one column to act on.
  // Who actually gets a column: someone who attends clients. Receptionists never do
  // (they don't take appointments — that's why "recepcion levels" shouldn't be a column).
  // An admin/super_admin only shows if they explicitly also attend clients.
  const attendsClients = (b: Barber) =>
    b.role === "barber" ||
    b.role === undefined || // fallback rows (from appointments) are barbers
    ((b.role === "admin" || b.role === "super_admin") && !!b.also_attends_clients);

  // Off today = has a schedule row for this weekday with is_working === false. No row
  // means "assume working" (don't hide someone just for missing config).
  const worksToday = (b: Barber) => {
    const s = schedules[b.id];
    return !s || s.is_working !== false;
  };

  const computeDisplayBarbers = (): Barber[] => {
    // Barber: restrict to themselves. Prefer their row from the fetched list (correct name).
    if (isBarber && user?.id) {
      const self = barbers.find((b) => b.id === user.id);
      return [self || { id: user.id, name: user.name || "Yo" }];
    }
    // Admin/reception view: only client-attending professionals who work today. This
    // removes receptionists and staff on their day off from the calendar columns.
    if (barbers.length > 0) {
      return barbers.filter((b) => attendsClients(b) && worksToday(b));
    }
    const fromAppts = Array.from(
      new Map(
        appointments
          .filter((a) => a.barber_id && a.barber?.name)
          .map((a) => [a.barber_id, { id: a.barber_id, name: a.barber!.name } as Barber])
      ).values()
    );
    if (fromAppts.length > 0) return fromAppts;
    if (user?.id) return [{ id: user.id, name: user.name || "Yo" }];
    return [];
  };
  const displayBarbers: Barber[] = computeDisplayBarbers();

  const groupPros: Barber[] = barbers.filter(attendsClients);
  const groupedAllowed = !isBarber && groupWeekActive && groupPros.length >= 2 && groupPros.length <= 4;
  // Varios dias a la vez: un profesional puntual (como antes) o, si el negocio lo activo,
  // todos sus profesionales agrupados. Con "1 dia" y sin profesional sigue la grilla normal.
  // Un solo profesional en el negocio: no hay a quien elegir, queda fijo y salen 1/3/7 dias de inmediato.
  const soloPro = !isBarber && groupPros.length === 1 ? groupPros[0] : null;
  useEffect(() => {
    if (soloPro && professionalFilter !== soloPro.id) setProfessionalFilter(soloPro.id);
  }, [soloPro?.id, professionalFilter]);
  const multiDay = !!professionalFilter || (groupedAllowed && rangeDays > 1);
  const multiPros: Barber[] = professionalFilter
    ? (displayBarbers.filter((b) => b.id === professionalFilter).length > 0
        ? displayBarbers.filter((b) => b.id === professionalFilter)
        : [{ id: professionalFilter, name: "Profesional" } as Barber])
    : groupPros;
  const rangeDates = multiDay
    ? Array.from({ length: rangeDays }, (_, i) => dateStrOffset(date, i))
    : [date];

  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [apptDetails, setApptDetails] = useState<any>(null);
  const [apptTab, setApptTab] = useState<"detalles" | "historial">("detalles");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editingApptTime, setEditingApptTime] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  // Editar servicio(s) de una cita (Nico, 29-sep)
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [editingApptServices, setEditingApptServices] = useState(false);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [adjustEnd, setAdjustEnd] = useState(true);
  const [savingServices, setSavingServices] = useState(false);

  const openApptDetails = async (apptId: string) => {
    setSelectedApptId(apptId);
    setApptTab("detalles");
    setEditingApptTime(false);
    setEditingApptServices(false);
    setLoadingDetails(true);
    const res = await fetch(`/api/appointments/${apptId}/details`);
    const data = await res.json();
    setApptDetails(data);
    // Pre-fill edit form with current values
    setEditDate(data.date || "");
    setEditStartTime(data.start_time?.match(/(\d{2}:\d{2})/)?.[1] || "10:00");
    setEditEndTime(data.end_time?.match(/(\d{2}:\d{2})/)?.[1] || "11:00");
    setLoadingDetails(false);
  };

  const updateApptStatus = async (status: string) => {
    if (!selectedApptId) return;
    // Cancelling closes the popup (the appointment leaves the board). Every other status
    // change (Pendiente/Confirmado/En atencion/Completado) should STAY open and reflect
    // immediately, so the user sees it took effect instead of the popup vanishing.
    const isCancel = status === "cancelled";
    try {
      const res = await fetch(`/api/appointments/${selectedApptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Don't lie with a success toast when the server rejected the change (this was the
      // bug: it said "Estado actualizado" but nothing saved, so reopening showed the old
      // status). Surface the real error instead.
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "No se pudo actualizar el estado", "error");
        return;
      }
      showToast("Estado actualizado", "success");
      // Reflect the new status in the open popup right away.
      setApptDetails((prev: any) => (prev ? { ...prev, status } : prev));
      if (isCancel) setSelectedApptId(null);
      await fetchAppointments();
    } catch {
      showToast("No se pudo actualizar el estado", "error");
    }
  };

  // Tick the current-time line every minute.
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Drag-to-create state
  const [dragging, setDragging] = useState(false);
  const [dragBarberId, setDragBarberId] = useState<string | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragEndY, setDragEndY] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [popupTab, setPopupTab] = useState<"service" | "event">("service");
  const [popupData, setPopupData] = useState({ barberId: "", startTime: "", endTime: "", barberName: "" });
  // Dia de la columna tocada en la vista de varios dias; null = el dia que se esta viendo (`date`).
  const [popupDay, setPopupDay] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ barberId: string; y: number } | null>(null);
  // Moving an EXISTING appointment via touch (long-press + drag), mirrors the native
  // HTML5 drag used on desktop (draggable/onDragStart/onDrop), which has no touch
  // equivalent at all — that's the actual reason "mover la cita" didn't work on
  // tablet/celular.
  const [movingApptId, setMovingApptId] = useState<string | null>(null);
  const moveTouchRef = useRef<{ apptId: string; startClientX: number; startClientY: number; activated: boolean } | null>(null);
  const moveLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Popup form
  const [selectedService, setSelectedService] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [eventName, setEventName] = useState("");
  // Cupos que ocupa el bloqueo nuevo (0 = todo el horario). Solo con cupos por bloque.
  const [blockSpots, setBlockSpots] = useState(0);
  const [eventNotes, setEventNotes] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  // Celular y correo obligatorios al crear un cliente desde la cita (sin ellos no hay registro).
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [popupPosition, setPopupPosition] = useState<"left" | "right">("right");

  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch data
  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const params = t ? `?tenantId=${t}` : "";
    Promise.all([
      fetch(`/api/barberos${params}`).then((r) => r.json()),
      fetch(`/api/services${params}`).then((r) => r.json()),
      fetch(`/api/clients${params}`).then((r) => r.json()),
    ]).then(([b, s, c]) => {
      setBarbers(Array.isArray(b) ? b : []);
      setServices(Array.isArray(s) ? s : []);
      setClients(Array.isArray(c?.clients) ? c.clients : Array.isArray(c) ? c : []);
    }).catch(() => {
      setBarbers([]);
      setServices([]);
      setClients([]);
    });
  }, [tenant?.id, tenantLoading]);

  // Fetch appointments once tenant context is resolved — do NOT gate on barbers,
  // otherwise a barber with an empty/slow barbers list would spin forever.
  // Re-run when the barber identity resolves so the barberId scope is applied.
  useEffect(() => {
    if (tenantLoading) return;
    fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tenantLoading, tenant?.id, isBarber, user?.id, professionalFilter, rangeDays, groupedAllowed]);

  // Ajuste del negocio "profesionales agrupados" (se ignora si la migracion 087 no esta aplicada).
  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    fetch(`/api/settings/calendar-view${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json())
      .then((d) => setGroupWeekActive(!!d?.active))
      .catch(() => setGroupWeekActive(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);

  // Cupos por bloque (solo Kinesiologia): si es mayor a 1, las citas que coinciden en el tiempo
  // se muestran una al lado de la otra en vez de encimadas. Con 1 no cambia nada.
  const [slotCap, setSlotCap] = useState(1);
  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    fetch(`/api/settings/slot-capacity${t ? `?tenantId=${t}` : ""}`)
      .then((r) => r.json())
      .then((d) => setSlotCap(d?.eligible ? Math.max(1, Number(d?.max) || 1) : 1))
      .catch(() => setSlotCap(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantLoading, tenant?.id]);
  // Ancho minimo de cada dia en la vista de 1/3/7 dias: con cupos hace falta mas para que quepan lado a lado.
  const colMin = slotCap > 1 ? 120 + slotCap * 60 : 110;
  const laneLayout = (list: any[]): Record<string, { lane: number; cols: number }> => {
    const toMin = (t: string) => { const m = t?.match(/(\d{2}):(\d{2})/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0; };
    const items = list.map((a) => ({ id: a.id as string, s: toMin(a.start_time), e: toMin(a.end_time) })).sort((a, b) => a.s - b.s || a.e - b.e);
    const out: Record<string, { lane: number; cols: number }> = {};
    let cluster: typeof items = [];
    let clusterEnd = -1;
    const flush = () => {
      const laneEnds: number[] = [];
      for (const it of cluster) {
        let lane = laneEnds.findIndex((end) => end <= it.s);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.e); } else laneEnds[lane] = it.e;
        out[it.id] = { lane, cols: 1 };
      }
      // Con cupos por bloque cada cita ocupa 1/cupo del ancho aunque este sola: asi queda a la vista
      // el espacio donde cae el siguiente cliente (y se puede tocar para agendarlo).
      for (const it of cluster) out[it.id].cols = Math.max(slotCap, laneEnds.length);
      cluster = [];
    };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    }
    if (cluster.length) flush();
    return out;
  };

  // Espacios (cupos) de un profesional en un tramo: cuantos estan ocupados por citas o bloqueos parciales y cuantos quedan libres.
  const toMinStr = (t: string) => { const m = t?.match(/(\d{2}):(\d{2})/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0; };
  const spacesAt = (barberId: string, day: string, startT: string, endT: string) => {
    const s0 = toMinStr(startT), e0 = toMinStr(endT);
    const occ = appointments
      .filter((a: any) => a.barber_id === barberId && (a.date || date) === day && !["cancelled", "no_show"].includes(a.status))
      .map((a: any) => ({ name: a.client?.name || "Cliente", start: toMinStr(a.start_time), end: toMinStr(a.end_time) }))
      .filter((x) => x.end > s0 && x.start < e0);
    const held: { start: number; end: number }[] = occ.map((x) => ({ start: x.start, end: x.end }));
    let blockedSpots = 0;
    for (const b of rangeBlocks) {
      if (b.barber_id !== barberId || b.date !== day || b.all_day || !b.start_time || !b.end_time || !(Number(b.spots) > 0)) continue;
      const bs = toMinStr(b.start_time), be = toMinStr(b.end_time);
      if (be > s0 && bs < e0) { for (let i = 0; i < Number(b.spots); i++) held.push({ start: bs, end: be }); blockedSpots = Math.max(blockedSpots, Number(b.spots)); }
    }
    const taken = Math.min(slotCap, peakOverlap(held, s0, e0));
    return { names: occ.map((x) => x.name), taken, free: Math.max(0, slotCap - taken), blockedSpots };
  };
  // Recuadros punteados "Espacio libre" al lado de una cita cuando todavia cabe otro cliente (se ven, y se toca para agendar).
  const freeLaneHints = (list: any[], lanes: Record<string, { lane: number; cols: number }> | null, blockList: any[], wrap: boolean) => {
    if (!lanes) return [] as Array<{ key: string; top: number; height: number; leftPct: number; widthPct: number }>;
    const out = new Map<string, { key: string; top: number; height: number; leftPct: number; widthPct: number }>();
    for (const a of list) {
      if (["cancelled", "no_show"].includes(a.status)) continue;
      const l = lanes[a.id];
      if (!l || l.cols < 2) continue;
      const as = toMinStr(a.start_time), ae = toMinStr(a.end_time);
      if (blockList.some((b) => b.all_day || (Number(b.spots) > 0 && toMinStr(b.end_time) > as && toMinStr(b.start_time) < ae))) continue;
      const used = new Set(list.filter((o) => lanes[o.id] && toMinStr(o.end_time) > as && toMinStr(o.start_time) < ae).map((o) => wrap ? lanes[o.id].lane % l.cols : lanes[o.id].lane));
      for (let lane = 0; lane < l.cols; lane++) {
        if (used.has(lane)) continue;
        const key = `${lane}-${as}-${ae}`;
        out.set(key, { key, top: ((as - START_HOUR * 60) / 60) * HOUR_HEIGHT, height: Math.max(((ae - as) / 60) * HOUR_HEIGHT, 24), leftPct: (100 / l.cols) * lane, widthPct: 100 / l.cols });
      }
    }
    return Array.from(out.values());
  };

  // Cuando hay un profesional elegido (vista 1/3/7 dias), se pide el rango completo de
  // dias de una sola vez en vez de un fetch por dia -- ver dateFrom/dateTo en
  // /api/appointments. Sin profesional elegido, se comporta exactamente igual que antes
  // (un solo dia, todos los profesionales).

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const t = getActiveTenantId();
      const params = new URLSearchParams();
      if (multiDay) {
        params.set("dateFrom", rangeDates[0]);
        params.set("dateTo", rangeDates[rangeDates.length - 1]);
      } else {
        params.set("date", date);
      }
      if (t) params.set("tenantId", t);
      // A barber only fetches their own appointments (don't ship the whole team's data
      // to their browser). El filtro de profesional (para admin/recepcion) solo aplica
      // cuando el usuario no es ya un barbero restringido a si mismo.
      if (isBarber && user?.id) params.set("barberId", user.id);
      else if (professionalFilter) params.set("barberId", professionalFilter);
      const res = await fetch(`/api/appointments?${params.toString()}`);
      const data = await res.json();
      // Filter out cancelled and no_show appointments
      setAppointments(Array.isArray(data) ? data.filter((a: any) => !["cancelled", "no_show"].includes(a.status)) : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
    // Also refresh blocks
    setBlocksRefresh((n) => n + 1);
  };

  // Fetch blocks whenever the barber list, date, or refresh trigger changes.
  // Load blocks for the SAME set of barbers the grid renders (displayBarbers), not just
  // the raw `barbers` list. If that list came back empty (e.g. the barbers fetch failed
  // or hasn't resolved), we still fall back to the logged-in user, so a block just
  // created for that column actually shows up instead of silently disappearing.
  const [blocksRefresh, setBlocksRefresh] = useState(0);
  // Bloqueos y horarios de TODOS los profesionales en una sola llamada
  // (/api/calendar/barber-data). Antes eran 1 llamada por profesional y mes (bloqueos) mas
  // 1 por profesional (horarios), y los horarios se pedian de nuevo en cada cambio de dia.
  const barberTargetIds = (barbers.length > 0 ? barbers.map((b) => b.id) : (user?.id ? [user.id] : [])).join(",");
  const rangeFrom = rangeDates[0] < date ? rangeDates[0] : date;
  const rangeTo = rangeDates[rangeDates.length - 1] > date ? rangeDates[rangeDates.length - 1] : date;

  // Bloqueos: solo del rango visible; se vuelven a pedir al cambiar de dia o tras editar uno.
  useEffect(() => {
    if (!barberTargetIds) { setBlocks([]); setRangeBlocks([]); return; }
    let cancelled = false;
    fetch(`/api/calendar/barber-data?include=blocks&barberIds=${barberTargetIds}&from=${rangeFrom}&to=${rangeTo}`)
      .then((r) => r.json())
      .catch(() => ({ blocks: [] }))
      .then((res) => {
        if (cancelled) return;
        const allBlocks = (Array.isArray(res?.blocks) ? res.blocks : []).filter((bl: any) => bl && bl.date);
        setBlocks(allBlocks.filter((bl: any) => bl.date === date));
        setRangeBlocks(allBlocks.filter((bl: any) => rangeDates.includes(bl.date)));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberTargetIds, date, blocksRefresh, rangeDates.join(",")]);

  // Horarios: se piden UNA vez por grupo de profesionales (la semana completa); el dia
  // visto se saca de ahi sin volver a la red. Dia de la semana desde el texto de la fecha
  // (evitar new Date(date), que se corre por zona horaria).
  const [allSchedules, setAllSchedules] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (!barberTargetIds) { setAllSchedules({}); return; }
    let cancelled = false;
    fetch(`/api/calendar/barber-data?include=schedules&barberIds=${barberTargetIds}`)
      .then((r) => r.json())
      .catch(() => ({ schedules: {} }))
      .then((res) => { if (!cancelled) setAllSchedules(res?.schedules && typeof res.schedules === "object" ? res.schedules : {}); });
    return () => { cancelled = true; };
  }, [barberTargetIds]);

  useEffect(() => {
    const [y, m, d] = date.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay(); // 0=Dom..6=Sab, local, sin corrimiento
    const map: Record<string, any> = {};
    for (const id of Object.keys(allSchedules)) {
      const day = (allSchedules[id] || []).find((s: any) => s.day_of_week === weekday);
      if (day) {
        map[id] = {
          is_working: day.is_working !== false,
          start_time: day.start_time || null,
          end_time: day.end_time || null,
          break_start: day.break_start || null,
          break_end: day.break_end || null,
        };
      }
    }
    setSchedules(map);
  }, [allSchedules, date]);

  // Navigation
  const changeDate = (delta: number) => {
    // En la vista por profesional a varios dias, "siguiente/anterior" avanza el bloque
    // completo (ej. la semana entera), no un solo dia -- si no, avanzar "1" solo movería
    // la primera columna y dejaría 6 dias repetidos.
    const step = multiDay ? rangeDays : 1;
    const d = new Date(date);
    d.setDate(d.getDate() + delta * step);
    setDate(d.toISOString().split("T")[0]);
  };
  const isToday = date === todayInChile();

  // Convert Y position to time
  const yToTime = (y: number): string => {
    const totalMinutes = START_HOUR * 60 + Math.round((y / HOUR_HEIGHT) * 60 / 15) * 15;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  const formatTime12 = (time24: string) => {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
  };

  // Mouse handlers for drag-to-create
  const handleMouseDown = (e: React.MouseEvent, barberId: string) => {
    // Don't start drag-to-create if clicking on an existing appointment
    if ((e.target as HTMLElement).closest("[data-appointment]")) return;
    // Only left click
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDragging(true);
    setDragBarberId(barberId);
    setDragStartY(y);
    setDragEndY(y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragEndY(Math.max(0, e.clientY - rect.top));
  };

  const handleMouseUp = (fromLeave = false) => {
    if (!dragging || !dragBarberId) { setDragging(false); return; }
    
    const minY = Math.min(dragStartY, dragEndY);
    const maxY = Math.max(dragStartY, dragEndY);
    
    // Un clic simple (sin arrastrar) tambien abre el popup de Agendar / Bloquear, igual que el
    // toque en el celular: parte con 45 min y se ajusta ahi mismo.
    const isClick = maxY - minY < 10;
    // Si el mouse solo salio de la columna sin soltar, no se abre nada.
    if (isClick && fromLeave) { setDragging(false); return; }

    const startTime = yToTime(minY);
    const endTime = isClick ? yToTime(minY + HOUR_HEIGHT * 0.75) : yToTime(maxY);
    const barber = displayBarbers.find((b) => b.id === dragBarberId);

    // Calculate popup position: if barber is in the right half, show popup on left
    const barberIndex = displayBarbers.findIndex((b) => b.id === dragBarberId);
    const isRightSide = barberIndex >= displayBarbers.length / 2;
    setPopupPosition(isRightSide ? "left" : "right");
    setPopupDay(null);

    setPopupData({
      barberId: dragBarberId,
      startTime,
      endTime,
      barberName: barber?.name || "",
    });
    setShowPopup(true);
    setPopupTab("service");
    // Auto-select the shortest service
    const shortest = services.length > 0 ? services.reduce((min, s) => s.duration < min.duration ? s : min, services[0]) : null;
    setSelectedService(shortest?.id || "");
    setSelectedClient("");
    setClientSearch("");
    setEventName("");
    setEventNotes("");
    setDragging(false);
  };

  // Open the creation popup explicitly (used by the "Agendar" button — reliable on mobile
  // where drag-to-create requires an awkward long-press).
  const openCreatePopup = (barberId: string, startTime: string, endTime: string, day?: string) => {
    const barber = displayBarbers.find((b) => b.id === barberId);
    setPopupDay(day || null);
    setPopupPosition("right");
    setPopupData({ barberId, startTime, endTime, barberName: barber?.name || "" });
    setShowPopup(true);
    setPopupTab("service");
    const shortest = services.length > 0 ? services.reduce((min, s) => s.duration < min.duration ? s : min, services[0]) : null;
    setSelectedService(shortest?.id || "");
    setSelectedClient("");
    setClientSearch("");
    setEventName("");
    setEventNotes("");
  };

  // Default barber for the "Agendar" button: the logged-in professional if they're in the
  // column list, otherwise the first available column.
  const defaultAgendarBarberId = (): string => {
    if (user?.id && displayBarbers.some((b) => b.id === user.id)) return user.id;
    return displayBarbers[0]?.id || "";
  };

  const handleAgendarClick = () => {
    const barberId = defaultAgendarBarberId();
    if (!barberId) { showToast("No hay profesionales disponibles", "error"); return; }
    // Default to 10:00–10:45 (a typical slot); user can adjust in the popup.
    openCreatePopup(barberId, "10:00", "10:45");
  };

  // Touch handlers for mobile drag-to-create (long-press to activate)
  const touchRef = useRef<{ barberId: string; startY: number; startX: number; el: HTMLElement; activated: boolean } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Register non-passive touchmove to allow preventDefault when dragging
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      // Moving an EXISTING appointment (long-press activated in handleApptTouchStart).
      // Find which barber column is under the finger right now, since the cita can be
      // dropped on a different barber too, just like the desktop native drag.
      if (moveTouchRef.current?.activated) {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const column = target?.closest("[data-barber-column]") as HTMLElement | null;
        if (column) {
          const barberId = column.dataset.barberColumn!;
          const rect = column.getBoundingClientRect();
          setDropIndicator({ barberId, y: Math.max(0, touch.clientY - rect.top) });
        }
        return;
      }

      if (!touchRef.current) return;

      const touch = e.touches[0];

      // If not activated yet, check if finger moved too much (= scrolling, cancel)
      if (!touchRef.current.activated) {
        const dx = Math.abs(touch.clientX - touchRef.current.startX);
        const rect = touchRef.current.el.getBoundingClientRect();
        const dy = Math.abs(touch.clientY - rect.top - touchRef.current.startY);
        if (dx > 10 || dy > 15) {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          touchRef.current = null;
        }
        return; // Not activated, allow scroll
      }

      // Activated: BLOCK scroll and update drag
      e.preventDefault();
      e.stopPropagation();
      const rect = touchRef.current.el.getBoundingClientRect();
      const y = Math.max(0, touch.clientY - rect.top);
      setDragEndY(y);
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  });

  const handleTouchStart = (e: React.TouchEvent, barberId: string) => {
    if ((e.target as HTMLElement).closest("[data-appointment]")) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const y = touch.clientY - rect.top;
    touchRef.current = { barberId, startY: y, startX: touch.clientX, el: e.currentTarget as HTMLElement, activated: false };

    // Start long-press timer (400ms hold = activate create mode)
    longPressTimer.current = setTimeout(() => {
      if (!touchRef.current) return;
      touchRef.current.activated = true;
      setDragging(true);
      setDragBarberId(barberId);
      setDragStartY(y);
      setDragEndY(y);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  };

  // Cuando se abre el cuadro con un toque, se ignora el "clic" fantasma que el celular dispara justo
  // despues sobre el fondo (si no, el cuadro se cerraba solo o tomaba otro bloque).
  const popupOpenedAt = useRef(0);
  useBackToClose(showPopup, () => setShowPopup(false));
  useBackToClose(!!selectedApptId, () => setSelectedApptId(null));
  useBackToClose(!!editingBlock, () => setEditingBlock(null));

  const handleTouchEnd = (e?: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (!touchRef.current || !touchRef.current.activated) {
      // Toque corto (sin mover el dedo ni mantener): abre "Agendar / Bloquear" en ese
      // profesional y a esa hora. Mover el dedo es scroll y cancela touchRef antes de llegar aqui.
      const tap = touchRef.current;
      touchRef.current = null;
      setDragging(false);
      if (tap && !showPopup) {
        e?.preventDefault();
        popupOpenedAt.current = Date.now();
        openCreatePopup(tap.barberId, yToTime(tap.startY), yToTime(tap.startY + HOUR_HEIGHT * 0.75));
      }
      return;
    }
    handleMouseUp();
    touchRef.current = null;
  };

  // Create appointment from popup
  const handleCreate = async () => {
    setCreating(true);
    const day = popupDay || date;

    if (popupTab === "service") {
      if (!selectedService) { showToast("Selecciona un servicio", "error"); setCreating(false); return; }
      // Escribiste un nombre pero no elegiste ni añadiste al cliente: antes la cita quedaba sin cliente.
      if (clientSearch.trim().length >= 2 && !selectedClient) {
        showToast("Elige al cliente de la lista o toca \"Añadir como cliente nuevo\" antes de crear la cita", "error");
        setCreating(false);
        return;
      }
      
      const startISO = `${day}T${popupData.startTime}:00`;
      const endISO = `${day}T${popupData.endTime}:00`;

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient || undefined,
          barberId: popupData.barberId,
          date: day,
          startTime: startISO,
          endTime: endISO,
          serviceIds: [selectedService],
          notes: eventNotes || undefined,
          tenantId: tenant?.id || getActiveTenantId(),
        }),
      });
      
      if (res.ok) {
        showToast("Cita creada", "success");
      } else {
        const err = await res.json();
        showToast(err.error || "Error al crear cita", "error");
      }
    } else {
      // Create block/event
      const blockRes = await fetch("/api/barber/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: popupData.barberId,
          date: day,
          allDay: false,
          startTime: popupData.startTime,
          endTime: popupData.endTime,
          reason: eventName || "Bloqueo",
          ...(slotCap > 1 && blockSpots > 0 && blockSpots < slotCap ? { spots: Math.max(1, Math.min(blockSpots, spacesAt(popupData.barberId, day, popupData.startTime, popupData.endTime).free)) } : {}),
        }),
      });
      if (blockRes.ok) {
        showToast("Bloqueo creado", "success");
        setBlockSpots(0);
      } else {
        const err = await blockRes.json().catch(() => ({}));
        showToast(err.error || "No se pudo crear el bloqueo", "error");
      }
    }

    setCreating(false);
    setShowPopup(false);
    await fetchAppointments();
  };

  // Move an EXISTING appointment to a new barber/time slot. Shared by the desktop
  // native HTML5 drag (onDrop) and the touch long-press-drag below, so both paths stay
  // in sync. Preserves the appointment's real duration instead of assuming a fixed
  // 45min block, and surfaces a toast if the server rejects the move.
  const moveAppointmentTo = async (apptId: string, barberId: string, y: number) => {
    const appt = appointments.find((a: any) => a.id === apptId);
    const sm = appt?.start_time?.match(/(\d{2}):(\d{2})/);
    const em = appt?.end_time?.match(/(\d{2}):(\d{2})/);
    const durationMin = sm && em
      ? (parseInt(em[1]) * 60 + parseInt(em[2])) - (parseInt(sm[1]) * 60 + parseInt(sm[2]))
      : 45;

    const newTime = yToTime(y);
    const [h, m] = newTime.split(":").map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + Math.max(durationMin, 15);
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const newStartISO = `${date}T${newTime}:00`;
    const newEndISO = `${date}T${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}:00`;

    const res = await fetch(`/api/appointments/${apptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barber_id: barberId, start_time: newStartISO, end_time: newEndISO }),
    });

    if (res.ok) {
      showToast("Cita movida", "success");
    } else {
      showToast("No se pudo mover la cita", "error");
    }
    await fetchAppointments();
  };

  // Touch drag-to-move for an existing appointment (long-press to activate, mirrors the
  // desktop native drag). Native HTML5 draggable has no touch equivalent, which is why
  // moving a cita after creating it didn't work at all on tablet/celular.
  const handleApptTouchStart = (e: React.TouchEvent, apptId: string) => {
    e.stopPropagation();
    const touch = e.touches[0];
    moveTouchRef.current = { apptId, startClientX: touch.clientX, startClientY: touch.clientY, activated: false };
    moveLongPressTimer.current = setTimeout(() => {
      if (!moveTouchRef.current) return;
      moveTouchRef.current.activated = true;
      setMovingApptId(apptId);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  };

  // Cancel the long-press-to-move if the finger moves too much before it activates
  // (that's a normal scroll gesture, not an intent to move the cita).
  const handleApptTouchMoveEarly = (e: React.TouchEvent) => {
    const ref = moveTouchRef.current;
    if (!ref || ref.activated) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - ref.startClientX);
    const dy = Math.abs(touch.clientY - ref.startClientY);
    if (dx > 10 || dy > 15) {
      if (moveLongPressTimer.current) clearTimeout(moveLongPressTimer.current);
      moveTouchRef.current = null;
    }
  };

  const handleApptTouchEnd = async (e: React.TouchEvent) => {
    e.stopPropagation();
    if (moveLongPressTimer.current) clearTimeout(moveLongPressTimer.current);
    const ref = moveTouchRef.current;
    moveTouchRef.current = null;
    setMovingApptId(null);
    if (!ref || !ref.activated) return;
    // Prevent the tap-to-open-details click from firing right after a drag-move.
    e.preventDefault();
    const indicator = dropIndicator;
    setDropIndicator(null);
    if (!indicator) return;
    await moveAppointmentTo(ref.apptId, indicator.barberId, indicator.y);
  };

  // Appointment block position - parse UTC time directly (avoid timezone shift)
  const getBlockStyle = (appt: Appointment) => {
    // Extract hours:minutes from the ISO string directly (stored as UTC = Chile time in this app)
    const startMatch = appt.start_time.match(/(\d{2}):(\d{2})/);
    const endMatch = appt.end_time.match(/(\d{2}):(\d{2})/);
    if (!startMatch || !endMatch) return { top: "0px", height: "24px" };
    
    const startMin = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
    const endMin = parseInt(endMatch[1]) * 60 + parseInt(endMatch[2]);
    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
    return { top: `${top}px`, height: `${Math.max(height, 24)}px` };
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);

  // Create a client right from the appointment popup, so a receptionist/professional
  // never has to abandon the calendar to go to Clientes and lose the in-progress cita.
  const createClientInline = async () => {
    const name = clientSearch.trim();
    if (!name) return;
    if (newClientPhone.replace(/\D/g, "").length < 8) { showToast("Ingresa un celular valido", "error"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClientEmail.trim())) { showToast("Ingresa un correo valido", "error"); return; }
    setCreatingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: newClientPhone.trim(), email: newClientEmail.trim(), source: "walk_in", tenantId: getActiveTenantId() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setShowNewClientForm(false);
        setNewClientPhone("");
        setNewClientEmail("");
        setSelectedClient(data.id);
        setClientSearch(data.name);
        setFilteredClients([]);
        showToast("Cliente guardado. Ahora toca \"Crear\" para agendar la cita", "success");
      } else {
        showToast(data.error || "Error al crear cliente", "error");
      }
    } catch {
      showToast("Error al crear cliente", "error");
    } finally {
      setCreatingClient(false);
    }
  };

  // Cambiar estado desde la vista Lista — misma logica que tenia la pagina Agenda antes
  // de fusionarse aca (punto 20).
  const updateListStatus = async (id: string, status: string) => {
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

  const searchClients = async (query: string) => {
    if (query.length < 2) { setFilteredClients([]); return; }
    const t = tenant?.id || "";
    const params = new URLSearchParams();
    if (t) params.set("tenantId", t);
    params.set("search", query);
    params.set("limit", "8");
    const res = await fetch(`/api/clients?${params.toString()}`);
    const data = await res.json();
    setFilteredClients(data.clients || []);
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4 animate-fade-in">
      {/* Cabecera premium (mismo look del Dashboard) */}
      <div className="flex items-center justify-between gap-3 md:items-end">
        <div>
          <h1 className="hidden text-2xl font-bold tracking-tight text-brand-dark md:block md:text-3xl">Calendario</h1>
          <p className="text-base font-semibold text-brand-dark first-letter:uppercase md:mt-0.5 md:text-sm md:font-normal md:text-brand-gray">
            {multiDay && rangeDays > 1 ? (
              <>
                {new Date(rangeDates[0] + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                {" – "}
                {new Date(rangeDates[rangeDates.length - 1] + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                {" · "}
                {professionalFilter ? displayBarbers.find((b) => b.id === professionalFilter)?.name : "Todos los profesionales"}
              </>
            ) : (
              new Date(date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
            )}
          </p>
        </div>
        <button onClick={handleAgendarClick} className={`${primaryButton} shrink-0`}>
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Agendar
        </button>
      </div>

      {/* Barra de controles: navegacion de fecha, vista, profesional y rango */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-2">
        <div className="flex items-center gap-1 rounded-xl bg-brand-light p-1">
          <button aria-label="Anterior" onClick={() => changeDate(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-gray transition-colors hover:bg-white hover:text-brand-dark">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            onClick={() => setDate(todayInChile())}
            className={`h-9 rounded-lg px-3.5 text-sm font-semibold transition-all ${isToday ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "text-brand-dark hover:bg-white"}`}
          >
            Hoy
          </button>
          <button aria-label="Siguiente" onClick={() => changeDate(1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-gray transition-colors hover:bg-white hover:text-brand-dark">
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 md:flex-none"
        />

        <button
          type="button"
          aria-label="Filtros"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          className={`relative flex h-11 w-11 items-center justify-center rounded-xl border transition-colors md:hidden ${showFilters ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-gray-200 bg-white text-brand-gray"}`}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
          {(professionalFilter || fullDay || view === "lista" || !mobileGrid || rangeDays !== 1) && !showFilters && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-blue" />
          )}
        </button>

        {/* Resto de controles: siempre visibles en pantallas medianas; en celular, tras "Filtros". */}
        <div className={`${showFilters ? "contents" : "hidden"} md:contents`}>
        <div className="hidden h-6 w-px bg-gray-100 md:block" />

        <Segmented
          size="sm"
          value={view}
          onChange={(v) => setView(v as "calendario" | "lista")}
          options={[{ value: "calendario", label: "Calendario" }, { value: "lista", label: "Lista" }]}
        />

        {view === "calendario" && (
          <div className="md:hidden">
            <Segmented
              size="sm"
              value={mobileGrid ? "grilla" : "tarjetas"}
              onChange={(v) => chooseMobileView(v === "grilla")}
              options={[{ value: "grilla", label: "Grilla" }, { value: "tarjetas", label: "Tarjetas" }]}
            />
          </div>
        )}

        {view === "calendario" && !soloPro && (
          <select
            value={professionalFilter}
            onChange={(e) => { setProfessionalFilter(e.target.value); setRangeDays(1); }}
            className={`h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-brand-dark outline-none focus:border-brand-blue ${mobileGrid ? "block" : "hidden md:block"}`}
          >
            <option value="">Todos los profesionales</option>
            {displayBarbers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        {view === "calendario" && (professionalFilter || groupedAllowed) && (
          <div className={mobileGrid ? "block" : "hidden md:block"}>
            <Segmented
              size="sm"
              value={String(rangeDays)}
              onChange={(v) => setRangeDays(Number(v) as 1 | 3 | 7)}
              options={[{ value: "1", label: "1 día" }, { value: "3", label: "3 días" }, { value: "7", label: "7 días" }]}
            />
          </div>
        )}
        {view === "calendario" && (
          <button
            onClick={() => setFullDay((v) => !v)}
            title={fullDay ? "Ver horario reducido (08:00 - 21:00)" : "Ver todo el dia (00:00 - 24:00)"}
            className={`${mobileGrid ? "inline-flex" : "hidden md:inline-flex"} h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
              fullDay ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-gray-200 bg-white text-brand-dark hover:border-brand-blue/40"
            }`}
          >
            <Sun className="h-4 w-4" strokeWidth={2} />
            {fullDay ? "Horario reducido" : "Todo el día"}
          </button>
        )}
        {view === "lista" && (
          <select
            value={listBarberFilter}
            onChange={(e) => setListBarberFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-brand-dark outline-none focus:border-brand-blue"
          >
            <option value="">Todos los profesionales</option>
            {displayBarbers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        </div>
      </div>

      {/* Celular: tira de dias + chips de profesional + agenda por tarjetas (la grilla de
          columnas queda para pantallas medianas en adelante). */}
      {view === "calendario" && !mobileGrid && (
        <div
          className="space-y-3 md:hidden"
          onTouchStart={(e) => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const st = swipeRef.current;
            swipeRef.current = null;
            if (!st) return;
            const dx = e.changedTouches[0].clientX - st.x;
            const dy = e.changedTouches[0].clientY - st.y;
            // Deslizar horizontal (no scroll vertical, no chips deslizables): cambia de dia.
            if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && !(e.target as HTMLElement).closest("[data-noswipe]")) {
              changeDate(dx < 0 ? 1 : -1);
            }
          }}
        >
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => dateStrOffset(date, i - 3)).map((d) => {
              const dt = new Date(d + "T12:00:00");
              const sel = d === date;
              const tod = d === todayInChile();
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={`flex flex-col items-center rounded-2xl border py-2 transition-all ${
                    sel
                      ? "border-transparent bg-gradient-to-br from-brand-blue to-emerald-500 text-white shadow-lg shadow-brand-blue/25"
                      : tod
                      ? "border-brand-blue/40 bg-brand-blue/5 text-brand-dark"
                      : "border-gray-100 bg-white text-brand-dark"
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${sel ? "text-white/80" : "text-brand-gray"}`}>
                    {dt.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "").slice(0, 3)}
                  </span>
                  <span className="text-base font-bold tabular-nums">{dt.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div data-noswipe className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${soloPro ? "hidden" : ""}`}>
            {[{ id: "", name: "Todos" }, ...displayBarbers].map((b) => {
              const active = professionalFilter === b.id;
              return (
                <button
                  key={b.id || "all"}
                  onClick={() => { setProfessionalFilter(b.id); setRangeDays(1); }}
                  className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                    active ? "border-transparent bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "border-gray-100 bg-white text-brand-gray"
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>

          {loading ? <Spinner /> : (() => {
            const dayList = rangeDates.map((d) => ({
              d,
              items: appointments
                .filter((a: any) => (rangeDates.length === 1 || a.date === d) && (!professionalFilter || a.barber_id === professionalFilter))
                .sort((x: any, y: any) => String(x.start_time).localeCompare(String(y.start_time))),
            }));
            // Bloqueos manuales del rango (solo de los profesionales visibles), para que en
            // tarjetas tambien se vea cuando alguien tiene el horario bloqueado.
            const blocksOf = (d: string) =>
              rangeBlocks
                .filter((bl) => bl.date === d && (!professionalFilter || bl.barber_id === professionalFilter) && displayBarbers.some((b) => b.id === bl.barber_id))
                .sort((x, y) => String(x.start_time || "").localeCompare(String(y.start_time || "")));
            const totalItems = dayList.reduce((n, x) => n + x.items.length + blocksOf(x.d).length, 0);
            if (totalItems === 0) {
              return (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
                    <CalendarX className="h-6 w-6" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-brand-dark">Sin citas este día</p>
                  <p className="mt-1 text-xs text-brand-gray">Agenda una nueva con el botón +</p>
                </div>
              );
            }
            return (
              <div className="space-y-4">
                {dayList.map(({ d, items }) => (
                  <div key={d} className="space-y-2">
                    {rangeDates.length > 1 && (
                      <p className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-gray">
                        {new Date(d + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" })}
                      </p>
                    )}
                    {blocksOf(d).map((bl) => (
                      <button
                        key={bl.id}
                        type="button"
                        onClick={() => openBlockEditor({
                          id: bl.id,
                          barberId: bl.barber_id,
                          reason: bl.reason || "",
                          allDay: bl.all_day,
                          startTime: bl.start_time?.slice(0, 5) || "09:00",
                          endTime: bl.end_time?.slice(0, 5) || "18:00",
                        })}
                        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-3 text-left active:scale-[0.99]"
                      >
                        <div className="flex w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-gray-200/70 py-2">
                          <span className="text-base font-bold tabular-nums text-gray-500">{bl.all_day ? "Día" : (bl.start_time?.slice(0, 5) || "")}</span>
                          <span className="text-[10px] tabular-nums text-gray-400">{bl.all_day ? "completo" : (bl.end_time?.slice(0, 5) || "")}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-gray-500">Bloqueo{bl.reason ? ` · ${bl.reason}` : ""}</p>
                          {!professionalFilter && (
                            <p className="truncate text-[11px] text-gray-400">{displayBarbers.find((b) => b.id === bl.barber_id)?.name}</p>
                          )}
                        </div>
                      </button>
                    ))}
                    {items.map((a: any) => {
                      const st = statusBadge[a.status] || statusBadge.scheduled;
                      const t1 = a.start_time?.match(/(\d{2}:\d{2})/)?.[1] || "";
                      const t2 = a.end_time?.match(/(\d{2}:\d{2})/)?.[1] || "";
                      const bi = Math.max(0, displayBarbers.findIndex((b) => b.id === a.barber_id));
                      const col = barberColors[bi % barberColors.length];
                      return (
                        <div
                          key={a.id}
                          role="button"
                          onClick={() => openApptDetails(a.id)}
                          className="w-full rounded-2xl border border-gray-100 bg-white p-3 text-left transition-all active:scale-[0.99]"
                        >
                          <div className="flex items-stretch gap-3">
                          <div className="flex w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-brand-light py-2">
                            <span className="text-base font-bold tabular-nums text-brand-dark">{t1}</span>
                            <span className="text-[10px] tabular-nums text-brand-gray">{t2}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-brand-dark">
                                <span className="truncate">{a.client?.name || "Cliente"}</span>
                                {a.is_new_client && <span className="shrink-0 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-wide text-white">Nuevo</span>}
                              </p>
                              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-brand-gray">
                              {a.services?.map((sv: any) => sv.service?.name).join(", ") || "Sin servicio"}
                            </p>
                            {!professionalFilter && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${col.bg} ${col.text}`}>
                                  {(a.barber?.name || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                                </span>
                                <span className="truncate text-[11px] text-brand-gray">{a.barber?.name}</span>
                              </div>
                            )}
                          </div>
                                                  </div>
                          {(a.status === "scheduled" || a.status === "confirmed" || a.status === "in_progress") && (
                            <div className="mt-2.5 flex gap-2 border-t border-gray-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => updateListStatus(a.id, a.status === "scheduled" ? "confirmed" : a.status === "confirmed" ? "in_progress" : "completed")}
                                className="flex-1 rounded-xl bg-brand-blue py-2.5 text-xs font-bold text-white shadow-md shadow-brand-blue/20 active:scale-95"
                              >
                                {a.status === "scheduled" ? "Confirmar" : a.status === "confirmed" ? "Iniciar" : "Completar"}
                              </button>
                              <button
                                onClick={() => openApptDetails(a.id)}
                                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-semibold text-brand-dark active:scale-95"
                              >
                                Ver detalle
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Vista a 1/3/7 dias — una columna por dia, solo lectura (version simple: click para ver
          el detalle; arrastrar para crear/mover sigue solo en la vista de 1 dia). Muestra UN
          profesional (cuando se elige uno) o, si el negocio activo "profesionales agrupados"
          (2 a 4 personas), TODOS agrupados: cada profesional con sus dias juntos. */}
      {view === "calendario" && multiDay && (loading ? <Spinner /> : (
        <div className={`overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm ${mobileGrid ? "block" : "hidden md:block"}`}>
          <div style={{ minWidth: Math.max(800, 56 + multiPros.length * rangeDates.length * colMin) }}>
            {multiPros.length > 1 && (
              <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
                <div className="w-14 flex-shrink-0 border-r border-gray-100" />
                {multiPros.map((pro, pi) => {
                  const color = barberColors[pi % barberColors.length];
                  return (
                    <div key={pro.id} style={{ flex: rangeDates.length }} className="flex items-center justify-center gap-2 border-r-2 border-gray-300 p-2">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${color.bg} ${color.text} text-[10px] font-bold`}>
                        {pro.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="truncate text-xs font-semibold text-brand-dark">{pro.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="w-14 flex-shrink-0 border-r border-gray-100" />
              {multiPros.map((pro) =>
                rangeDates.map((d, di) => {
                  const isColTodayHeader = d === todayInChile();
                  const label = new Date(d + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
                  const lastOfGroup = multiPros.length > 1 && di === rangeDates.length - 1;
                  return (
                    <div key={`${pro.id}-${d}`} className={`flex-1 p-2 text-center ${lastOfGroup ? "border-r-2 border-gray-300" : "border-r border-gray-100"} ${isColTodayHeader ? "bg-blue-50" : ""}`} style={{ minWidth: colMin }}>
                      <p className={`text-[11px] font-medium truncate mt-0.5 ${isColTodayHeader ? "text-blue-700" : "text-gray-700"}`}>{label}</p>
                    </div>
                  );
                })
              )}
            </div>
            <div className="relative flex">
              <div className="w-14 flex-shrink-0 border-r border-gray-100">
                {hours.map((h) => (
                  <div key={h} className="h-16 flex items-start justify-end pr-1.5">
                    <span className="text-[10px] text-gray-400 -mt-1.5">{h.toString().padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {multiPros.map((pro, pi) =>
                rangeDates.map((d, di) => {
                  const dayAppts = appointments.filter((a: any) => a.date === d && a.barber_id === pro.id);
                  const dayBlocks = rangeBlocks.filter((bl) => bl.date === d && bl.barber_id === pro.id);
                  const dayLanes = slotCap > 1 ? laneLayout(dayAppts) : null;
                  const isColToday = d === todayInChile();
                  const lastOfGroup = multiPros.length > 1 && di === rangeDates.length - 1;
                  // Con un solo profesional se mantiene el azul de siempre; con varios, un color por profesional.
                  const color = multiPros.length > 1 ? barberColors[pi % barberColors.length] : { bg: "bg-blue-100", border: "border-l-blue-500", text: "text-blue-800" };
                  return (
                    <div
                      key={`${pro.id}-${d}`}
                      className={`flex-1 relative ${lastOfGroup ? "border-r-2 border-gray-300" : "border-r border-gray-100"}`}
                      style={{ minWidth: colMin }}
                      onClick={(e) => {
                        // Un clic (o toque) en un espacio vacio abre Agendar/Bloquear para ESE profesional,
                        // ESE dia y a la hora tocada. Las citas y bloqueos tienen su propio clic.
                        if (!(e.target as HTMLElement).closest("[data-slot]")) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = Math.max(0, e.clientY - rect.top);
                        popupOpenedAt.current = Date.now();
                        openCreatePopup(pro.id, yToTime(y), yToTime(y + HOUR_HEIGHT * 0.75), d);
                      }}
                    >
                      {hours.map((h) => (
                        <div key={h} data-slot className="relative h-16 cursor-pointer border-b border-gray-200/70 hover:bg-gray-50/70">
                          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-200/50" />
                        </div>
                      ))}
                      {isColToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none h-[2px] bg-red-500"
                          style={{ top: `${((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                        />
                      )}
                      {dayBlocks.map((block) => {
                        let top = 0, height = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
                        if (!block.all_day && block.start_time && block.end_time) {
                          const sm = block.start_time.match(/(\d{2}):(\d{2})/);
                          const em = block.end_time.match(/(\d{2}):(\d{2})/);
                          if (sm && em) {
                            const startMin = parseInt(sm[1]) * 60 + parseInt(sm[2]);
                            const endMin = parseInt(em[1]) * 60 + parseInt(em[2]);
                            top = Math.max(((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT, 0);
                            height = Math.max(((endMin - START_HOUR * 60) / 60) * HOUR_HEIGHT - top, 24);
                          }
                        }
                        return (
                          <div
                            key={block.id}
                            className="absolute left-1 right-1 rounded-md bg-gray-100 border border-gray-200 px-1.5 py-1 overflow-hidden z-[5] cursor-pointer hover:bg-gray-200/70"
                            style={partialBlockStyle(block, { top: `${top}px`, height: `${Math.max(height, 24)}px` })}
                            onClick={() => openBlockEditor({
                              id: block.id,
                              barberId: block.barber_id,
                              reason: block.reason || "",
                              allDay: block.all_day,
                              startTime: block.start_time?.slice(0, 5) || "09:00",
                              endTime: block.end_time?.slice(0, 5) || "18:00",
                              spots: Number(block.spots) || 0,
                            })}
                          >
                            <p className="text-[10px] font-medium text-gray-500 truncate">{block.reason || "Bloqueado"}</p>
                            {!block.all_day && block.start_time && block.end_time && (
                              <p className="text-[9px] text-gray-400">{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</p>
                            )}
                            {block.all_day && <p className="text-[9px] text-gray-400">Todo el dia</p>}
                          {Number(block.spots) > 0 && Number(block.spots) < slotCap && <p className="text-[9px] text-gray-400">{block.spots} cupo{Number(block.spots) > 1 ? "s" : ""}</p>}
                          </div>
                        );
                      })}
                      {freeLaneHints(dayAppts, dayLanes, dayBlocks, true).map((h) => (
                        <div key={h.key} className="pointer-events-none absolute z-[1] rounded-lg border border-dashed border-gray-400/50 px-1.5 py-1 text-[9px] font-medium text-gray-400"
                          style={{ top: h.top, height: h.height, left: `calc(${h.leftPct}% + 2px)`, width: `calc(${h.widthPct}% - 4px)` }}>
                          Espacio libre
                        </div>
                      ))}
                      {dayAppts.map((appt: any) => {
                        const sm = appt.start_time?.match(/(\d{2}):(\d{2})/);
                        const em = appt.end_time?.match(/(\d{2}):(\d{2})/);
                        const timeLabel = sm && em ? `${parseInt(sm[1])}:${sm[2]} – ${parseInt(em[1])}:${em[2]}` : "";
                        return (
                          <div
                            key={appt.id}
                            onClick={() => openApptDetails(appt.id)}
                            className={`absolute left-1 right-1 rounded-lg border-l-[3px] shadow-sm ${color.bg} ${color.border} ${color.text} px-1.5 py-1 overflow-hidden cursor-pointer hover:shadow-md hover:brightness-95 transition-all z-10`}
                            style={(() => {
                              const base: any = getBlockStyle(appt);
                              const l = dayLanes?.[appt.id];
                              if (l && l.cols > 1) {
                                const w = 100 / l.cols;
                                return { ...base, left: `calc(${w * (l.lane % l.cols)}% + 2px)`, width: `calc(${w}% - 4px)`, right: "auto" };
                              }
                              return base;
                            })()}
                          >
                            <p className="flex items-center gap-1 text-[11px] font-bold">
                              <span className="truncate">{appt.client?.name || "Cliente"}</span>
                              {appt.is_new_client && <span title="Cliente nuevo" className="shrink-0 rounded bg-emerald-500 px-1 py-px text-[8px] font-extrabold uppercase leading-none tracking-wide text-white">Nuevo</span>}
                            </p>
                            <p className="text-[9px] truncate opacity-70">{appt.services?.map((s: any) => s.service?.name).join(", ")}</p>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[9px] opacity-50 truncate">{timeLabel}</p>
                              <span className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded ${(statusBadge[appt.status] || statusBadge.scheduled).cls}`}>
                                {(statusBadge[appt.status] || statusBadge.scheduled).label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {dayAppts.length === 0 && dayBlocks.length === 0 && (
                        <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-[11px] text-gray-300">Sin citas</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ))}

      {view === "calendario" && !multiDay && (loading ? <Spinner /> : (
        <div className={`overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm ${mobileGrid ? "block" : "hidden md:block"}`}>
          <div className="min-w-[800px]">
            {/* Barber headers */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="w-14 flex-shrink-0 border-r border-gray-100" />
              {displayBarbers.map((barber, i) => {
                const color = barberColors[i % barberColors.length];
                return (
                  <div key={barber.id} className="flex-1 p-2 text-center border-r border-gray-100 min-w-[120px]">
                    <div className={`inline-flex h-8 w-8 rounded-full ${color.bg} ${color.text} items-center justify-center text-[11px] font-bold ring-2 ring-white`}>
                      {barber.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-brand-dark">{barber.name}</p>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="relative flex" ref={(el) => { (gridRef as any).current = el; (gridContainerRef as any).current = el; }}>
              {/* Current-time line (like Setmore). Only on today's view and only while the
                  clock is within the grid's hour range. Spans the full width across every
                  barber column so you can see at a glance where "now" sits. */}
              {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: `${((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                >
                  {/* Time badge on the left, over the hour-labels column (w-14) */}
                  <span className="w-14 flex-shrink-0 flex justify-center">
                    <span className="text-[10px] font-bold text-white bg-red-500 rounded px-1 py-0.5 leading-none">
                      {Math.floor(nowMinutes / 60).toString().padStart(2, "0")}:{(nowMinutes % 60).toString().padStart(2, "0")}
                    </span>
                  </span>
                  {/* The line itself, across the barber columns */}
                  <span className="flex-1 h-[2px] bg-red-500 relative">
                    <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                  </span>
                </div>
              )}

              {/* Time labels */}
              <div className="w-14 flex-shrink-0 border-r border-gray-100">
                {hours.map((h) => (
                  <div key={h} className="h-16 flex items-start justify-end pr-1.5">
                    <span className="text-[10px] text-gray-400 -mt-1.5">{h.toString().padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>

              {/* Barber columns */}
              {displayBarbers.map((barber, bi) => {
                const barberAppts = appointments.filter((a: any) => a.barber_id === barber.id);
                const lanes = slotCap > 1 ? laneLayout(barberAppts) : null;
                const color = barberColors[bi % barberColors.length];
                const isDragTarget = dragging && dragBarberId === barber.id;

                return (
                  <div
                    key={barber.id}
                    data-barber-column={barber.id}
                    className="flex-1 relative border-r border-gray-100 min-w-[120px] select-none"
                    onMouseDown={(e) => handleMouseDown(e, barber.id)}
                    onMouseMove={(e) => {
                      handleMouseMove(e);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverInfo({ barberId: barber.id, y: Math.max(0, e.clientY - rect.top) });
                    }}
                    onMouseUp={() => handleMouseUp()}
                    onMouseLeave={() => { if (dragging) handleMouseUp(true); setHoverInfo(null); }}
                    onTouchStart={(e) => handleTouchStart(e, barber.id)}
                    onTouchEnd={handleTouchEnd}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; 
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropIndicator({ barberId: barber.id, y: e.clientY - rect.top });
                    }}
                    onDragLeave={() => setDropIndicator(null)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setDropIndicator(null);
                      const appointmentId = e.dataTransfer.getData("appointmentId");
                      if (!appointmentId) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      await moveAppointmentTo(appointmentId, barber.id, y);
                    }}
                  >
                    {/* Hour grid lines */}
                    {hours.map((h) => (
                      <div key={h} className="relative h-16 border-b border-gray-200/70 hover:bg-gray-50/50">
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-200/50" />
                      </div>
                    ))}

                    {/* Out-of-hours shading. Greys out the parts of the day OUTSIDE this
                        barber's shift (before open, after close, during break, or the
                        whole day if they don't work) so unavailable time is obvious at a
                        glance — David's request (a barber closing at 3PM should look dimmed
                        after 3). Purely visual: sits under appointments (z below), doesn't
                        block clicks/drag to create. */}
                    {(() => {
                      const sched = schedules[barber.id];
                      const gridTopMin = START_HOUR * 60;
                      const gridBotMin = END_HOUR * 60;
                      const toMin = (t: string | null) => {
                        const m = t?.match(/(\d{2}):(\d{2})/);
                        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
                      };
                      const shade = (fromMin: number, toMinutes: number, key: string) => {
                        const a = Math.max(fromMin, gridTopMin);
                        const b = Math.min(toMinutes, gridBotMin);
                        if (b <= a) return null;
                        return (
                          <div
                            key={key}
                            className="absolute left-0 right-0 pointer-events-none z-[1]"
                            style={{
                              top: `${((a - gridTopMin) / 60) * HOUR_HEIGHT}px`,
                              height: `${((b - a) / 60) * HOUR_HEIGHT}px`,
                              background: "rgba(148,163,184,0.18)",
                            }}
                          />
                        );
                      };
                      // No schedule info → don't shade (assume available, avoids greying
                      // the whole grid by mistake).
                      if (!sched) return null;
                      // Doesn't work this day → shade the whole visible grid.
                      if (!sched.is_working) return shade(gridTopMin, gridBotMin, "offday");
                      const open = toMin(sched.start_time);
                      const close = toMin(sched.end_time);
                      const parts: (JSX.Element | null)[] = [];
                      if (open !== null) parts.push(shade(gridTopMin, open, "before"));
                      if (close !== null) parts.push(shade(close, gridBotMin, "after"));
                      const bs = toMin(sched.break_start);
                      const be = toMin(sched.break_end);
                      if (bs !== null && be !== null) parts.push(shade(bs, be, "break"));
                      return parts;
                    })()}

                    {/* Drop indicator - shows where block will land */}
                    {dropIndicator && dropIndicator.barberId === barber.id && (
                      <div
                        className="absolute left-1 right-1 h-12 bg-blue-500/20 border-2 border-blue-500 rounded-md pointer-events-none z-30 flex items-center justify-center"
                        style={{ top: `${Math.round(dropIndicator.y / HOUR_HEIGHT * 4) * (HOUR_HEIGHT / 4)}px` }}
                      >
                        <span className="text-[10px] text-blue-600 font-bold">
                          {yToTime(Math.round(dropIndicator.y / HOUR_HEIGHT * 4) * (HOUR_HEIGHT / 4))}
                        </span>
                      </div>
                    )}

                    {/* Drag selection preview (during drag) */}
                    {isDragTarget && !showPopup && (
                      <div
                        className="absolute left-1 right-1 bg-blue-500/20 border-2 border-blue-500 border-dashed rounded-md pointer-events-none z-20"
                        style={{
                          top: `${Math.min(dragStartY, dragEndY)}px`,
                          height: `${Math.abs(dragEndY - dragStartY)}px`,
                        }}
                      >
                        <span className="text-[10px] text-blue-600 font-medium p-1">
                          {formatTime12(yToTime(Math.min(dragStartY, dragEndY)))} - {formatTime12(yToTime(Math.max(dragStartY, dragEndY)))}
                        </span>
                      </div>
                    )}

                    {/* Solid block after selection (stays visible while popup is open) */}
                    {showPopup && popupData.barberId === barber.id && (
                      <div
                        className="absolute left-1 right-1 bg-blue-500 rounded-md z-20 shadow-lg shadow-blue-500/30"
                        style={{
                          top: `${((parseInt(popupData.startTime.split(":")[0]) * 60 + parseInt(popupData.startTime.split(":")[1])) - START_HOUR * 60) / 60 * HOUR_HEIGHT}px`,
                          height: `${((parseInt(popupData.endTime.split(":")[0]) * 60 + parseInt(popupData.endTime.split(":")[1])) - (parseInt(popupData.startTime.split(":")[0]) * 60 + parseInt(popupData.startTime.split(":")[1]))) / 60 * HOUR_HEIGHT}px`,
                        }}
                      >
                        <div className="p-1.5 text-white">
                          <p className="text-[10px] font-bold">(Sin titulo)</p>
                          <p className="text-[9px] opacity-80">{formatTime12(popupData.startTime)} – {formatTime12(popupData.endTime)}</p>
                        </div>
                      </div>
                    )}

                    {/* Hover time/profesional tooltip — sigue el cursor con la hora
                        redondeada a 15 min y el nombre del profesional, para no tener que
                        mirar la columna de horas ni el header de arriba constantemente. No
                        se muestra mientras se arrastra (ya hay otro indicador de hora) ni
                        con el popup de crear cita abierto. */}
                    {hoverInfo && hoverInfo.barberId === barber.id && !dragging && !showPopup && (
                      <div
                        className="absolute left-1 right-1 z-40 pointer-events-none flex justify-center"
                        style={{ top: `${Math.max(0, hoverInfo.y - 11)}px` }}
                      >
                        <span className="text-[10px] font-bold text-white bg-gray-900/85 rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap">
                          {barber.name} · {formatTime12(yToTime(hoverInfo.y))}
                        </span>
                      </div>
                    )}

                    {/* Espacios libres al lado de una cita (cupos por bloque) */}
                    {freeLaneHints(barberAppts, lanes, blocks.filter((bl) => bl.barber_id === barber.id), false).map((h) => (
                      <div key={h.key} className="pointer-events-none absolute z-[1] rounded-lg border border-dashed border-gray-400/50 px-1.5 py-1 text-[9px] font-medium text-gray-400"
                        style={{ top: h.top, height: h.height, left: `calc(${h.leftPct}% + 2px)`, width: `calc(${h.widthPct}% - 4px)` }}>
                        Espacio libre · toca para agendar
                      </div>
                    ))}
                    {/* Appointment blocks */}
                    {barberAppts.map((appt: any) => {
                      const sm = appt.start_time?.match(/(\d{2}):(\d{2})/);
                      const em = appt.end_time?.match(/(\d{2}):(\d{2})/);
                      const timeLabel = sm && em ? `${parseInt(sm[1])}:${sm[2]} – ${parseInt(em[1])}:${em[2]}` : "";
                      const eH = em ? parseInt(em[1]) : 0;
                      const eM = em ? parseInt(em[2]) : 0;
                      const sH = sm ? parseInt(sm[1]) : 0;
                      const sM = sm ? parseInt(sm[2]) : 0;
                      return (
                      <div
                        key={appt.id}
                        data-appointment="true"
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData("appointmentId", appt.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onTouchStart={(e) => handleApptTouchStart(e, appt.id)}
                        onTouchMove={handleApptTouchMoveEarly}
                        onTouchEnd={handleApptTouchEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          openApptDetails(appt.id);
                        }}
                        className={`absolute left-1 right-1 rounded-lg border-l-[3px] shadow-sm ${color.bg} ${color.border} ${color.text} px-1.5 py-1 overflow-hidden cursor-pointer hover:shadow-md hover:brightness-95 transition-all z-10 group ${movingApptId === appt.id ? "opacity-40 ring-2 ring-blue-500" : ""}`}
                        style={(() => {
                          const base: any = getBlockStyle(appt);
                          const l = lanes?.[appt.id];
                          if (l && l.cols > 1) {
                            const w = 100 / l.cols;
                            return { ...base, left: `calc(${w * l.lane}% + 2px)`, width: `calc(${w}% - 4px)`, right: "auto" };
                          }
                          return base;
                        })()}
                      >
                        <p className="flex items-center gap-1 text-[11px] font-bold">
                            <span className="truncate">{appt.client?.name || "Cliente"}</span>
                            {appt.is_new_client && <span title="Cliente nuevo" className="shrink-0 rounded bg-emerald-500 px-1 py-px text-[8px] font-extrabold uppercase leading-none tracking-wide text-white">Nuevo</span>}
                          </p>
                        <p className="text-[9px] truncate opacity-70">{appt.services?.map((s: any) => s.service?.name).join(", ")}</p>
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[9px] opacity-50 truncate" data-timelabel>{timeLabel}</p>
                          {/* Status badge — visible confirmation state on the block itself. */}
                          <span className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded ${(statusBadge[appt.status] || statusBadge.scheduled).cls}`}>
                            {(statusBadge[appt.status] || statusBadge.scheduled).label}
                          </span>
                        </div>
                        {/* Resize handle */}
                        <div
                          className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            const startY = e.clientY;
                            const blockEl = e.currentTarget.parentElement!;
                            const origH = blockEl.offsetHeight;
                            const timeLabelEl = blockEl.querySelector("[data-timelabel]") as HTMLElement;
                            const onMove = (ev: MouseEvent) => {
                              const delta = ev.clientY - startY;
                              blockEl.style.height = `${Math.max(24, origH + delta)}px`;
                              // Update time label in real-time
                              if (timeLabelEl) {
                                const addMin = Math.round((delta / HOUR_HEIGHT) * 60 / 15) * 15;
                                const newEnd = eH * 60 + eM + addMin;
                                const nH = Math.floor(newEnd / 60), nM = newEnd % 60;
                                if (newEnd > sH * 60 + sM && newEnd <= END_HOUR * 60) {
                                  timeLabelEl.textContent = `${sH}:${sM.toString().padStart(2,"0")} – ${nH}:${nM.toString().padStart(2,"0")}`;
                                }
                              }
                            };
                            const onUp = async (ev: MouseEvent) => {
                              document.removeEventListener("mousemove", onMove);
                              document.removeEventListener("mouseup", onUp);
                              const addMin = Math.round(((ev.clientY - startY) / HOUR_HEIGHT) * 60 / 15) * 15;
                              const newEnd = eH * 60 + eM + addMin;
                              if (newEnd <= sH * 60 + sM || newEnd > END_HOUR * 60) { await fetchAppointments(); return; }
                              const nH = Math.floor(newEnd / 60), nM = newEnd % 60;
                              await fetch(`/api/appointments/${appt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ end_time: `${date}T${nH.toString().padStart(2,"0")}:${nM.toString().padStart(2,"0")}:00` }) });
                              showToast("Duracion actualizada", "success");
                              await fetchAppointments();
                            };
                            document.addEventListener("mousemove", onMove);
                            document.addEventListener("mouseup", onUp);
                          }}
                        ><div className="w-8 h-1 rounded-full bg-current opacity-40" /></div>
                      </div>
                      );
                    })}

                    {/* Schedule blocks */}
                    {blocks.filter((bl) => bl.barber_id === barber.id).map((block) => {
                      let top = 0, height = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
                      if (!block.all_day && block.start_time && block.end_time) {
                        const sm = block.start_time.match(/(\d{2}):(\d{2})/);
                        const em = block.end_time.match(/(\d{2}):(\d{2})/);
                        if (sm && em) {
                          const startMin = parseInt(sm[1]) * 60 + parseInt(sm[2]);
                          const endMin = parseInt(em[1]) * 60 + parseInt(em[2]);
                          const rawTop = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                          const rawBottom = ((endMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                          // Clamp to the visible grid so a block that starts before the grid
                          // (e.g. an early-morning block) never renders off-screen with its
                          // delete button out of reach. It stays clickable at the top edge.
                          top = Math.max(rawTop, 0);
                          height = Math.max(rawBottom - top, 24);
                        }
                      }
                      return (
                        <div
                          key={block.id}
                          className="absolute left-1 right-1 rounded-md bg-gray-100 border border-gray-200 px-1.5 py-1 overflow-hidden z-[5] cursor-pointer hover:bg-gray-200/70"
                          style={partialBlockStyle(block, { top: `${top}px`, height: `${Math.max(height, 24)}px` })}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Punto (Nico, 25-sep): antes esto mostraba un toast de solo
                            // lectura y la unica forma de actuar sobre el bloqueo era la X
                            // roja siempre visible. Ahora abre un panel con nombre, duracion
                            // y eliminar — sin la X.
                            openBlockEditor({
                              id: block.id,
                              barberId: block.barber_id,
                              reason: block.reason || "",
                              allDay: block.all_day,
                              startTime: block.start_time?.slice(0, 5) || "09:00",
                              endTime: block.end_time?.slice(0, 5) || "18:00",
                              spots: Number(block.spots) || 0,
                            });
                          }}
                        >
                          <p className="text-[10px] font-medium text-gray-500 truncate">{block.reason || "Bloqueado"}</p>
                          {!block.all_day && block.start_time && block.end_time && (
                            <p className="text-[9px] text-gray-400">{block.start_time?.slice(0,5)} – {block.end_time?.slice(0,5)}</p>
                          )}
                          {block.all_day && <p className="text-[9px] text-gray-400">Todo el dia</p>}
                          {Number(block.spots) > 0 && Number(block.spots) < slotCap && <p className="text-[9px] text-gray-400">{block.spots} cupo{Number(block.spots) > 1 ? "s" : ""}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Vista Lista — igual a lo que mostraba la antigua pagina Agenda (punto 20) */}
      {view === "lista" && (
        loading ? <Spinner /> : (() => {
          const listAppointments = listBarberFilter
            ? appointments.filter((a: any) => a.barber_id === listBarberFilter)
            : appointments;
          return listAppointments.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No hay citas para este dia</p>
          ) : (
            <div className="space-y-3">
              {listAppointments.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:border-brand-blue/30">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="rounded-lg bg-brand-blue/10 px-2 py-0.5 text-base font-bold tabular-nums text-brand-blue">{a.start_time?.match(/(\d{2}:\d{2})/)?.[1] || ""}</span>
                      <span className="font-medium text-gray-900">{a.client?.name || "-"}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${listStatusColors[a.status] || "bg-gray-100 text-gray-700"}`}>
                        {listStatusLabels[a.status] || a.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Profesional: {a.barber?.name || "-"} | Servicios: {a.services?.map((s: any) => s.service?.name).join(", ") || "-"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {a.status === "scheduled" && (
                      <button onClick={() => updateListStatus(a.id, "confirmed")}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">Confirmar</button>
                    )}
                    {a.status === "confirmed" && (
                      <button onClick={() => updateListStatus(a.id, "in_progress")}
                        className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">Iniciar</button>
                    )}
                    {a.status === "in_progress" && (
                      <button onClick={() => updateListStatus(a.id, "completed")}
                        className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Completar</button>
                    )}
                    {(a.status === "scheduled" || a.status === "confirmed") && (
                      <button onClick={() => updateListStatus(a.id, "cancelled")}
                        className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Cancelar</button>
                    )}
                    <button onClick={() => openApptDetails(a.id)}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Ver</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}

      {/* Google Calendar style popup - positioned beside the selection */}
      {showPopup && (
        <div className="fixed inset-0 z-50" onClick={() => { if (Date.now() - popupOpenedAt.current > 400) setShowPopup(false); }}>
          <div
            className={`fixed top-20 bg-white rounded-2xl shadow-2xl border border-gray-200 w-[90vw] md:w-96 animate-scale-in max-h-[80vh] overflow-y-auto ${
              popupPosition === "left" ? "left-4 md:left-16" : "right-4 md:right-8"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-lg">Agendar / Bloquear</h3>
              <button onClick={() => setShowPopup(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {popupDay && (
              <p className="px-4 pt-3 text-sm font-medium capitalize text-gray-700">
                {new Date(popupDay + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            )}

            {/* Tabs */}
            <div className="flex gap-4 px-4 pt-3 border-b">
              <button onClick={() => setPopupTab("service")}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${popupTab === "service" ? "border-brand-blue text-brand-blue" : "border-transparent text-gray-500"}`}>
                Agendar
              </button>
              <button onClick={() => setPopupTab("event")}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${popupTab === "event" ? "border-brand-blue text-brand-blue" : "border-transparent text-gray-500"}`}>
                Bloquear
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Time display - editable */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {new Date(date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <input type="time" value={popupData.startTime}
                  onChange={(e) => setPopupData({ ...popupData, startTime: e.target.value })}
                  className="border rounded-lg px-2 py-1 text-sm font-bold text-gray-900 w-24" />
                <span>–</span>
                <input type="time" value={popupData.endTime}
                  onChange={(e) => setPopupData({ ...popupData, endTime: e.target.value })}
                  className="border rounded-lg px-2 py-1 text-sm font-bold text-gray-900 w-24" />
              </div>

              {/* Barber */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <select
                  value={popupData.barberId}
                  onChange={(e) => {
                    const b = displayBarbers.find((br) => br.id === e.target.value);
                    setPopupData({ ...popupData, barberId: e.target.value, barberName: b?.name || "" });
                  }}
                  className="border rounded-lg px-2 py-1 text-sm font-medium text-gray-900"
                >
                  {displayBarbers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {slotCap > 1 && (() => {
                const sp = spacesAt(popupData.barberId, popupDay || date, popupData.startTime, popupData.endTime);
                const chips: { label: string; free: boolean }[] = [];
                for (let i = 0; i < slotCap; i++) {
                  if (i < sp.names.length) chips.push({ label: sp.names[i], free: false });
                  else if (i < sp.taken) chips.push({ label: "Bloqueado", free: false });
                  else chips.push({ label: "Libre", free: true });
                }
                return (
                  <div className="rounded-xl bg-gray-50 p-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Espacios a esa hora</p>
                    <div className="flex flex-wrap gap-1.5">
                      {chips.map((c, i) => (
                        <span key={i} className={`rounded-lg px-2 py-1 text-xs font-medium ${c.free ? "border border-dashed border-emerald-400 bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-700"}`}>
                          {String.fromCharCode(65 + i)} · {c.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      {sp.free > 0 ? "Cada espacio libre se puede agendar aquí o lo reserva un cliente por el link. Bloquéalo en la pestaña Bloquear si no quieres que se use." : "No quedan espacios libres a esa hora."}
                    </p>
                  </div>
                );
              })()}

              {popupTab === "service" ? (
                <>
                  {/* Service selector */}
                  <div>
                    <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm">
                      <option value="">Seleccione un servicio</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {formatCurrency(Number(s.price))} ({s.duration}min)</option>
                      ))}
                    </select>
                  </div>

                  {/* Client search */}
                  <div className="relative">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Cliente</span>
                    </div>
                    <input type="text" value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setSelectedClient(""); searchClients(e.target.value); }}
                      placeholder="Buscar cliente..."
                      className="w-full border rounded-xl px-3 py-2.5 text-sm" />
                    {selectedClient && <p className="mt-1 text-xs font-medium text-emerald-600">✓ Cliente listo. Toca "Crear" para guardar la cita.</p>}
                    {clientSearch.length >= 2 && !selectedClient && (
                      <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                        {filteredClients.map((c) => (
                          <button key={c.id} onClick={() => { setSelectedClient(c.id); setClientSearch(c.name); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                            <span className="block font-medium text-gray-800">{c.name}</span>
                            <span className="block text-[11px] text-gray-500">{c.phone || "Sin celular"}{c.email ? ` · ${c.email}` : ""}</span>
                          </button>
                        ))}
                        {/* Create the client right here instead of leaving the calendar. */}
                        {showNewClientForm ? (
                          <div className="p-2 border-t border-gray-100 space-y-2">
                            <p className="text-xs text-gray-500">Nuevo cliente: <span className="font-semibold text-gray-800">{clientSearch}</span></p>
                            <input type="tel" required autoFocus value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)}
                              placeholder="Celular *" className="w-full border rounded-lg px-3 py-2 text-sm" />
                            <input type="email" required value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createClientInline(); } }}
                              placeholder="Correo *" className="w-full border rounded-lg px-3 py-2 text-sm" />
                            <div className="flex gap-2">
                              <button onClick={createClientInline} disabled={creatingClient}
                                className="flex-1 px-3 py-2 bg-brand-blue text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                                {creatingClient ? "Añadiendo..." : "Añadir"}
                              </button>
                              <button onClick={() => { setShowNewClientForm(false); setNewClientPhone(""); setNewClientEmail(""); }}
                                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowNewClientForm(true)}
                            className="w-full text-left px-3 py-2 text-sm text-brand-blue font-medium hover:bg-brand-blue/5 border-t border-gray-100 flex items-center gap-1.5">
                            <span className="text-base leading-none">+</span>
                            {`Añadir "${clientSearch}" como cliente nuevo`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Event name */}
                  <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
                    placeholder="Nombre del evento o bloqueo"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" />
                  {slotCap > 1 && (
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Cupos que bloquea</label>
                      {(() => {
                        const free = spacesAt(popupData.barberId, popupDay || date, popupData.startTime, popupData.endTime).free;
                        return (
                          <select value={Math.min(blockSpots, free)} onChange={(e) => setBlockSpots(Number(e.target.value))}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm">
                            <option value={0}>Todo el horario (nadie puede reservar)</option>
                            {Array.from({ length: free }, (_, i) => i + 1).filter((n) => n < slotCap).map((n) => (
                              <option key={n} value={n}>{n} espacio{n > 1 ? "s" : ""} libre{n > 1 ? "s" : ""} ({free - n === 0 ? "ya no queda ninguno para reservar" : `quedan ${free - n} para reservar`})</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}

              {/* Notes */}
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 mt-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <input type="text" value={eventNotes} onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Notas (opcional)"
                  className="flex-1 border rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t">
              <button onClick={handleCreate} disabled={creating || (popupTab === "service" && !selectedService)}
                className={`${primaryButton} px-6`}>
                {creating ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Detail Popup */}
      {selectedApptId && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-20" onClick={() => setSelectedApptId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {loadingDetails ? (
              <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mx-auto" /></div>
            ) : apptDetails ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-bold text-lg text-brand-dark">Cita</h3>
                  <div className="flex items-center gap-2">
                    <select value={apptDetails.status} onChange={(e) => updateApptStatus(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium">
                      <option value="scheduled">Pendiente</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="in_progress">En atencion</option>
                      <option value="completed">Completado</option>
                      <option value="no_show">No presentado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                    <button onClick={() => setSelectedApptId(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-4">
                  <button onClick={() => setApptTab("detalles")}
                    className={`pb-2 pt-3 px-3 text-sm font-medium border-b-2 ${apptTab === "detalles" ? "border-brand-blue text-brand-blue" : "border-transparent text-brand-gray"}`}>
                    Detalles
                  </button>
                  <button onClick={() => setApptTab("historial")}
                    className={`pb-2 pt-3 px-3 text-sm font-medium border-b-2 ${apptTab === "historial" ? "border-brand-blue text-brand-blue" : "border-transparent text-brand-gray"}`}>
                    Historial
                  </button>
                </div>

                {apptTab === "detalles" ? (
                  <div className="p-4 space-y-4">
                    {/* Service */}
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-brand-blue mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-brand-dark">{apptDetails.services?.map((s: any) => s.service?.name).join(" + ")}</p>
                        <p className="text-xs text-brand-gray mt-0.5">
                          Costo: {formatCurrency(apptDetails.services?.reduce((s: number, sv: any) => s + Number(sv.price || 0), 0) || 0)}
                          {" · "}Duracion: {apptDetails.services?.reduce((s: number, sv: any) => s + (sv.service?.duration || 0), 0)} min
                        </p>
                      </div>
                    </div>

                    {/* Date & Time */}
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-brand-gray flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm text-brand-dark font-medium">
                          {new Date(apptDetails.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                          {"  "}
                          {apptDetails.start_time?.match(/(\d{2}:\d{2})/)?.[1] || ""}
                          {" – "}
                          {apptDetails.end_time?.match(/(\d{2}:\d{2})/)?.[1] || ""}
                        </p>
                      </div>
                    </div>

                    {/* Client */}
                    {apptDetails.client && (
                      <div className="flex items-start gap-3">
                        <svg className="w-4 h-4 text-brand-gray flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                        </svg>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-brand-dark">{apptDetails.client.name}</p>
                            {apptDetails.isNewClient && (
                              <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-wide text-white">Cliente nuevo</span>
                            )}
                            {!apptDetails.isNewClient && apptDetails.totalVisits > 0 && (
                              <span className="text-[10px] text-brand-gray">{apptDetails.totalVisits} {apptDetails.totalVisits === 1 ? "visita" : "visitas"}</span>
                            )}
                          </div>
                          {apptDetails.client.email && <p className="text-xs text-brand-gray">{apptDetails.client.email}</p>}
                          {apptDetails.client.phone && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-brand-gray">{apptDetails.client.phone}</p>
                              {/* WhatsApp the client straight from the appointment card — for
                                  the morning confirmation flow, without hunting for the number.
                                  Mensaje compartido con Mi Agenda: src/lib/whatsapp-confirm.ts */}
                              {(() => {
                                const waUrl = buildConfirmWhatsAppUrl({
                                  clientName: apptDetails.client.name,
                                  phone: apptDetails.client.phone,
                                  businessName: tenant?.name,
                                  professionalName: apptDetails.barber?.name,
                                  serviceNames: (apptDetails.services || []).map((s: any) => s.service?.name),
                                  date: apptDetails.date,
                                  time: apptDetails.start_time,
                                });
                                if (!waUrl) return null;
                                return (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#25D366] text-white text-[10px] font-medium rounded-full hover:bg-[#1da851] transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.63-1.218A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.239 0-4.332-.726-6.033-1.96l-.424-.316-2.745.722.734-2.682-.347-.553A9.963 9.963 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                                    </svg>
                                    WhatsApp
                                  </a>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Barber */}
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-brand-gray flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25" />
                      </svg>
                      <p className="text-sm text-brand-dark">{apptDetails.barber?.name}</p>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t space-y-2">
                      {/* Cobrar: jump to the POS with client, barber and services already
                          loaded, so the cashier doesn't have to search for the client by
                          hand (avoids name clashes when the shop is full). */}
                      <button
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (apptDetails.client?.id) params.set("clientId", apptDetails.client.id);
                          if (apptDetails.barber?.id) params.set("barberId", apptDetails.barber.id);
                          // La cita viaja al POS para que quede completada al cobrar.
                          if (apptDetails.id) params.set("appointmentId", apptDetails.id);
                          const svcIds = (apptDetails.services || [])
                            .map((s: any) => s.service?.id)
                            .filter(Boolean);
                          if (svcIds.length) params.set("serviceIds", svcIds.join(","));
                          router.push(`/dashboard/pos?${params.toString()}`);
                        }}
                        className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 flex items-center justify-center gap-1.5"
                      >
                        Cobrar
                      </button>
                      {apptDetails.client?.id && (
                        <button onClick={() => { router.push(`/dashboard/clientes/${apptDetails.client.id}`); }}
                          className="w-full py-2 bg-brand-blue/10 text-brand-blue rounded-xl text-xs font-medium hover:bg-brand-blue/20 flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Ver ficha de cliente
                        </button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => {
                            setEditServiceIds((apptDetails.services || []).map((sv: any) => sv.service?.id).filter(Boolean));
                            setAdjustEnd(true);
                            setEditingApptTime(false);
                            setEditingApptServices(true);
                          }}
                          className="py-2 border border-gray-200 rounded-xl text-xs text-brand-gray hover:bg-gray-50 font-medium">
                          Editar servicio
                        </button>
                        <button onClick={() => { setEditingApptServices(false); setEditingApptTime(true); }}
                          className="py-2 border border-gray-200 rounded-xl text-xs text-brand-gray hover:bg-gray-50 font-medium">
                          Editar hora
                        </button>
                        <button onClick={() => updateApptStatus("cancelled")}
                          className="col-span-2 py-2 border border-red-200 rounded-xl text-xs text-red-500 hover:bg-red-50 font-medium">
                          Cancelar cita
                        </button>
                      </div>
                    </div>

                    {/* Editar servicio(s) de la cita */}
                    {editingApptServices && (() => {
                      const chosen = services.filter((sv) => editServiceIds.includes(sv.id));
                      const totalPrice = chosen.reduce((n, sv) => n + Number(sv.price || 0), 0);
                      const totalMin = chosen.reduce((n, sv) => n + (sv.duration || 0), 0);
                      return (
                        <div className="mt-3 space-y-3 rounded-xl bg-brand-light p-3">
                          <p className="text-xs font-medium text-brand-dark">Modificar servicios</p>
                          <div className="flex flex-wrap gap-1.5">
                            {services.map((sv) => {
                              const on = editServiceIds.includes(sv.id);
                              return (
                                <button
                                  key={sv.id}
                                  type="button"
                                  onClick={() => setEditServiceIds((prev) => (on ? prev.filter((x) => x !== sv.id) : [...prev, sv.id]))}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                                    on ? "border-transparent bg-brand-blue text-white shadow-md shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray"
                                  }`}
                                >
                                  {sv.name} · {formatCurrency(sv.price)} · {sv.duration}m
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-brand-gray">
                            Total: <span className="font-semibold text-brand-dark">{formatCurrency(totalPrice)}</span> · {totalMin} min
                          </p>
                          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-brand-gray">
                            <input type="checkbox" checked={adjustEnd} onChange={(e) => setAdjustEnd(e.target.checked)} />
                            Ajustar la hora de término a la nueva duración
                          </label>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingApptServices(false)}
                              className="flex-1 rounded-lg border border-gray-200 py-1.5 text-[11px] text-brand-gray hover:bg-white">
                              Cancelar
                            </button>
                            <button
                              disabled={editServiceIds.length === 0 || savingServices}
                              onClick={async () => {
                                setSavingServices(true);
                                try {
                                  const res = await fetch(`/api/appointments/${selectedApptId}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ service_ids: editServiceIds, adjust_end: adjustEnd }),
                                  });
                                  if (!res.ok) throw new Error();
                                  showToast("Servicios actualizados", "success");
                                  setEditingApptServices(false);
                                  if (selectedApptId) await openApptDetails(selectedApptId);
                                  await fetchAppointments();
                                } catch {
                                  showToast("No se pudieron actualizar los servicios", "error");
                                } finally {
                                  setSavingServices(false);
                                }
                              }}
                              className="flex-1 rounded-lg bg-brand-blue py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40">
                              {savingServices ? "Guardando..." : "Guardar"}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Edit time/date form */}
                    {editingApptTime && (
                      <div className="mt-3 p-3 bg-brand-light rounded-xl space-y-3">
                        <p className="text-xs font-medium text-brand-dark">Modificar fecha y hora</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-brand-gray block mb-1">Fecha</label>
                            <input type="date" value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-brand-gray block mb-1">Inicio</label>
                            <input type="time" value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-brand-gray block mb-1">Fin</label>
                            <input type="time" value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingApptTime(false)}
                            className="flex-1 py-1.5 border border-gray-200 rounded-lg text-[11px] text-brand-gray hover:bg-white">
                            Cancelar
                          </button>
                          <button onClick={async () => {
                            await fetch(`/api/appointments/${selectedApptId}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                date: editDate,
                                start_time: `${editDate}T${editStartTime}:00`,
                                end_time: `${editDate}T${editEndTime}:00`,
                              }),
                            });
                            showToast("Cita reprogramada", "success");
                            setEditingApptTime(false);
                            setSelectedApptId(null);
                            await fetchAppointments();
                          }}
                            className="flex-1 py-1.5 bg-brand-blue text-white rounded-lg text-[11px] font-medium hover:opacity-90">
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {apptDetails.lastServices?.length > 0 ? (
                      <>
                        <p className="text-xs text-brand-gray font-medium uppercase">Ultimas visitas de {apptDetails.client?.name}</p>
                        {apptDetails.lastServices.map((svc: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                            <div className="w-6 h-6 rounded-full bg-brand-blue/10 flex items-center justify-center text-[10px] text-brand-blue font-bold">{i + 1}</div>
                            <p className="text-sm text-brand-dark">{svc || "—"}</p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-brand-gray">Sin historial previo</p>
                        {apptDetails.isNewClient && <p className="text-xs text-green-600 mt-1">Cliente nuevo — primera visita!</p>}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Panel de edicion de bloqueo — reemplaza la X roja: nombre, duracion y eliminar
          en un solo lugar (punto de Pablo, 25-sep). */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingBlock(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-lg text-brand-dark">Bloqueo</h3>
              <button onClick={() => setEditingBlock(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] text-brand-gray block mb-1">Nombre de bloqueo</label>
                <input
                  type="text"
                  value={editingBlock.reason}
                  onChange={(e) => setEditingBlock({ ...editingBlock, reason: e.target.value })}
                  placeholder="Ej: Almuerzo, Capacitacion..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-brand-gray">
                <input
                  type="checkbox"
                  checked={editingBlock.allDay}
                  onChange={(e) => setEditingBlock({ ...editingBlock, allDay: e.target.checked })}
                />
                Todo el dia
              </label>

              {!editingBlock.allDay && slotCap > 1 && (
                <div>
                  <label className="text-[10px] text-brand-gray block mb-1">Cupos que bloquea</label>
                  <select value={editingBlock.spots || 0} onChange={(e) => setEditingBlock({ ...editingBlock, spots: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value={0}>Todo el horario</option>
                    {Array.from({ length: slotCap - 1 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} cupo{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              {!editingBlock.allDay && (
                <div>
                  <label className="text-[10px] text-brand-gray block mb-1">Duracion</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-brand-gray block mb-1">Inicio</label>
                      <input type="time" step={900} value={editingBlock.startTime}
                        onChange={(e) => setEditingBlock({ ...editingBlock, startTime: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] text-brand-gray block mb-1">Fin</label>
                      <input type="time" step={900} value={editingBlock.endTime}
                        onChange={(e) => setEditingBlock({ ...editingBlock, endTime: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Eliminar bloqueo",
                      message: `Eliminar el bloqueo "${editingBlock.reason || "Sin motivo"}"?`,
                      confirmText: "Eliminar",
                      variant: "danger",
                    });
                    if (!ok) return;
                    await fetch(`/api/barber/blocks?id=${editingBlock.id}`, { method: "DELETE" });
                    showToast("Bloqueo eliminado", "success");
                    setEditingBlock(null);
                    await fetchAppointments();
                  }}
                  className="flex-1 py-2 border border-red-200 rounded-xl text-xs text-red-500 hover:bg-red-50 font-medium"
                >
                  Eliminar
                </button>
                <button
                  disabled={savingBlock}
                  onClick={async () => {
                    if (!editingBlock.allDay && editingBlock.startTime >= editingBlock.endTime) {
                      showToast("La hora de fin debe ser posterior al inicio", "error");
                      return;
                    }
                    setSavingBlock(true);
                    try {
                      const res = await fetch(`/api/barber/blocks?id=${editingBlock.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          reason: editingBlock.reason || null,
                          allDay: editingBlock.allDay,
                          startTime: editingBlock.allDay ? null : editingBlock.startTime,
                          endTime: editingBlock.allDay ? null : editingBlock.endTime,
                          ...(slotCap > 1 ? { spots: editingBlock.allDay || !editingBlock.spots ? null : editingBlock.spots } : {}),
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        showToast(err.error || "No se pudo guardar el bloqueo", "error");
                        return;
                      }
                      showToast("Bloqueo actualizado", "success");
                      setEditingBlock(null);
                      await fetchAppointments();
                    } finally {
                      setSavingBlock(false);
                    }
                  }}
                  className="flex-1 py-2 bg-brand-blue text-white rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {savingBlock ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-2 text-[11px] font-medium text-brand-gray">
        {[["bg-yellow-500", "Agendada"], ["bg-blue-500", "Confirmada"], ["bg-purple-500", "En atención"], ["bg-green-500", "Completada"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1">
            <span className={`h-2 w-2 rounded-full ${c}`} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}
