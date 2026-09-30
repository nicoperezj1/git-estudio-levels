"use client";

import { useState, useEffect, useMemo } from "react";
import { MessageCircle, Search, Copy, Check, Users, Info, ChevronDown, Link2, Hand, Ticket } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { todayInChile } from "@/lib/utils";
import { formatPhoneCL } from "@/lib/phone";
import { MessageQuotaBar } from "@/components/dashboard/message-quota-bar";
import { PageHeader, Panel, primaryButton, ghostButton, inputClass } from "@/components/ui/premium";

// Mensajes masivos por WhatsApp (copiar y pegar en una Lista de difusion de WhatsApp
// Business). Reestructurado por Nico (29-sep) en 3 pasos claros: 1) mensaje, 2) a quien,
// 3) copiar y enviar — con vista previa y segmentos con conteo real.

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  lastVisit: string | null;
  hasUpcoming?: boolean;
}

type Segment = "all" | "recent" | "inactive" | "never";

const WA_LIST_LIMIT = 256; // limite de contactos por Lista de difusion de WhatsApp

const formatPhone = formatPhoneCL;

// Dias calendario entre hoy (Chile) y una fecha YYYY-MM-DD, sin depender de la zona horaria.
function daysSince(dateStr: string, today: string): number {
  const a = Date.parse(today.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(dateStr.slice(0, 10) + "T12:00:00Z");
  return Math.round((a - b) / 86400000);
}

function lastVisitLabel(lastVisit: string | null, today: string): string {
  if (!lastVisit) return "Sin visitas";
  const d = daysSince(lastVisit, today);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 60) return `Hace ${d} días`;
  return `Hace ${Math.floor(d / 30)} meses`;
}

function StepHeader({ n, title, hint, done }: { n: number; title: string; hint: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black transition-colors ${
          done ? "bg-gradient-to-br from-brand-blue to-emerald-500 text-white shadow-md shadow-brand-blue/25" : "bg-brand-light text-brand-gray"
        }`}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-brand-dark">{title}</h3>
        <p className="text-xs text-brand-gray">{hint}</p>
      </div>
    </div>
  );
}

export default function WhatsAppBroadcastPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const { showToast } = useToast();
  const { tenant } = useTenant();

  const today = todayInChile();

  // Link de reserva del negocio (mismo patron usado en el resto de la app).
  const bookingLink = tenant?.slug ? `https://re-booking.cl/b/${tenant.slug}` : "https://re-booking.cl/booking";

  // Segmentos (definiciones claras):
  //  - Recientes: ultima visita completada hace 30 dias o menos.
  //  - Inactivos: tuvieron visitas pero la ultima fue hace MAS de 30 dias y no tienen cita por venir.
  //  - Sin visitas: registrados que aun no tienen ninguna visita completada.
  const inSegment = (c: Client, seg: Segment): boolean => {
    if (!c.phone) return false;
    if (seg === "all") return true;
    if (seg === "never") return !c.lastVisit;
    if (!c.lastVisit) return false;
    const d = daysSince(c.lastVisit, today);
    if (seg === "recent") return d <= 30;
    return d > 30 && !c.hasUpcoming;
  };

  useEffect(() => {
    fetch("/api/whatsapp/contacts")
      .then((r) => r.json())
      .then((data) => {
        const list: Client[] = Array.isArray(data) ? data : [];
        setClients(list);
        setSelectedIds(new Set(list.filter((c) => c.phone).map((c) => c.id)));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const t = todayInChile();
    const inSeg = (c: Client, seg: Segment) => {
      if (!c.phone) return false;
      if (seg === "all") return true;
      if (seg === "never") return !c.lastVisit;
      if (!c.lastVisit) return false;
      const d = daysSince(c.lastVisit, t);
      if (seg === "recent") return d <= 30;
      return d > 30 && !c.hasUpcoming;
    };
    return {
      all: clients.filter((c) => inSeg(c, "all")).length,
      recent: clients.filter((c) => inSeg(c, "recent")).length,
      inactive: clients.filter((c) => inSeg(c, "inactive")).length,
      never: clients.filter((c) => inSeg(c, "never")).length,
    };
  }, [clients]);

  const segmentList = clients.filter((c) => inSegment(c, segment));
  const q = search.trim().toLowerCase();
  const visible = q
    ? segmentList.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
    : segmentList;

  const changeSegment = (s: Segment) => {
    setSegment(s);
    setSearch("");
    // Al cambiar de segmento se seleccionan todos sus contactos (lo esperable).
    setSelectedIds(new Set(clients.filter((c) => inSegment(c, s)).map((c) => c.id)));
  };

  const selected = segmentList.filter((c) => selectedIds.has(c.id));
  // Numeros unicos (dos fichas con el mismo telefono no deben duplicarse en la lista).
  const phones = Array.from(new Set(selected.map((c) => formatPhone(c.phone!))));
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selectedIds.has(c.id));

  const toggleAllVisible = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) visible.forEach((c) => next.delete(c.id));
    else visible.forEach((c) => next.add(c.id));
    setSelectedIds(next);
  };

  const copy = async (key: string, text: string, toast: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
      showToast(toast, "success");
    } catch {
      showToast("No se pudo copiar. Revisa los permisos del navegador.", "error");
    }
  };

  const hasMessage = message.trim().length > 0;
  const hasContacts = phones.length > 0;

  const segments: { value: Segment; label: string; count: number; hint: string }[] = [
    { value: "all", label: "Todos", count: counts.all, hint: "Todos los clientes con teléfono" },
    { value: "recent", label: "Recientes", count: counts.recent, hint: "Vinieron en los últimos 30 días" },
    { value: "inactive", label: "Inactivos", count: counts.inactive, hint: "Su última visita fue hace más de 30 días y no tienen cita por venir" },
    { value: "never", label: "Sin visitas", count: counts.never, hint: "Registrados que aún no tienen visitas completadas" },
  ];
  const activeSegment = segments.find((s) => s.value === segment)!;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader title="Mensajes por WhatsApp" subtitle="Escribe un mensaje, elige a quién enviarlo y cópialo a tu Lista de difusión de WhatsApp Business." />

      <MessageQuotaBar channels={["whatsapp"]} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Columna izquierda: pasos 1 y 2 */}
        <div className="space-y-6 lg:col-span-3">
          {/* Paso 1 */}
          <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
            <StepHeader n={1} title="Escribe tu mensaje" hint="Lo que recibirán tus clientes" done={hasMessage} />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Ej: Hola! Te recordamos que puedes agendar tu próximo servicio en nuestro link: ${bookingLink}`}
              rows={5}
              className={`${inputClass} resize-none leading-relaxed`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-gray">Insertar:</span>
              {[
                { label: "Link de reserva", text: bookingLink, Icon: Link2 },
                { label: "Saludo", text: "Hola! ", Icon: Hand },
                { label: "Cupón", text: "\n\nUsa tu cupón: [CÓDIGO]", Icon: Ticket },
              ].map((t) => (
                <button
                  key={t.label}
                  onClick={() => setMessage((m) => m + t.text)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-gray transition-colors hover:border-brand-blue/40 hover:text-brand-blue"
                >
                  <t.Icon className="h-3.5 w-3.5" strokeWidth={2} /> {t.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] tabular-nums text-brand-gray">{message.length} caracteres</span>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
            <StepHeader n={2} title="Elige a quién enviarlo" hint="Filtra por segmento y ajusta la selección" done={hasContacts} />

            <div className="flex flex-wrap gap-2">
              {segments.map((s) => {
                const active = segment === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => changeSegment(s.value)}
                    title={s.hint}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-all ${
                      active ? "border-transparent bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/40"
                    }`}
                  >
                    {s.label}
                    <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-white/25" : "bg-brand-light"}`}>{s.count}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-brand-gray">{activeSegment.hint}.</p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-gray" strokeWidth={1.75} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono" className={`${inputClass} pl-10`} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between bg-brand-light px-4 py-2.5">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-xs font-semibold text-brand-dark">{q ? "Seleccionar resultados" : "Seleccionar todos"}</span>
                </label>
                <span className="text-xs font-semibold tabular-nums text-brand-gray">{selected.length} de {segmentList.length} seleccionados</span>
              </div>
              <div className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
                {loading ? (
                  <p className="p-6 text-center text-sm text-brand-gray">Cargando...</p>
                ) : visible.length === 0 ? (
                  <p className="p-6 text-center text-sm text-brand-gray">
                    {q ? "Sin resultados para tu búsqueda" : "No hay clientes en este segmento"}
                  </p>
                ) : (
                  visible.map((c) => {
                    const initials = c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-brand-blue/[0.04]">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                            setSelectedIds(next);
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue/25 to-brand-accent/10 text-xs font-bold text-brand-blue ring-1 ring-brand-blue/20">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-brand-dark">{c.name}</p>
                          <p className="text-xs tabular-nums text-brand-gray">{formatPhone(c.phone!)}</p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-brand-light px-2.5 py-1 text-[10px] font-semibold text-brand-gray">
                          {lastVisitLabel(c.lastVisit, today)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: vista previa y paso 3 */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:col-span-2 lg:self-start">
          <Panel title="Vista previa">
            <div className="rounded-2xl bg-[#e5ddd5]/60 p-4 dark:bg-white/5">
              {hasMessage ? (
                <div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2.5 text-sm leading-relaxed text-[#111b21] shadow-sm">
                  {message}
                  <p className="mt-1 text-right text-[10px] text-[#667781]">ahora ✓✓</p>
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-brand-gray">Así se verá tu mensaje. Escríbelo en el paso 1.</p>
              )}
            </div>
          </Panel>

          <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
            <StepHeader n={3} title="Copia y envía" hint="Se envía desde tu WhatsApp Business" done={false} />

            <div className="flex items-center gap-3 rounded-2xl bg-brand-blue/10 px-4 py-3">
              <Users className="h-5 w-5 flex-shrink-0 text-brand-blue" strokeWidth={1.75} />
              <p className="text-sm text-brand-dark">
                <span className="text-xl font-extrabold tabular-nums">{phones.length}</span>{" "}
                {phones.length === 1 ? "contacto listo" : "contactos listos"} para recibir el mensaje
              </p>
            </div>

            {phones.length > WA_LIST_LIMIT && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2} />
                WhatsApp permite hasta {WA_LIST_LIMIT} contactos por lista de difusión. Con {phones.length} necesitarás crear varias listas.
              </p>
            )}

            <div className="space-y-2">
              <button
                onClick={() => copy("msg", message, "Mensaje copiado")}
                disabled={!hasMessage}
                className={`${primaryButton} w-full`}
              >
                {copiedKey === "msg" ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2} />}
                {copiedKey === "msg" ? "¡Mensaje copiado!" : "Copiar mensaje"}
              </button>
              <button
                onClick={() => copy("phones", phones.join("\n"), `${phones.length} números copiados`)}
                disabled={!hasContacts}
                className={`${ghostButton} w-full`}
              >
                {copiedKey === "phones" ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <MessageCircle className="h-4 w-4" strokeWidth={2} />}
                {copiedKey === "phones" ? "¡Números copiados!" : `Copiar ${phones.length} números`}
              </button>
              <button
                onClick={() =>
                  copy(
                    "all",
                    `MENSAJE:\n${message}\n\nCONTACTOS (${phones.length}):\n${phones.join("\n")}`,
                    `Mensaje y ${phones.length} contactos copiados`
                  )
                }
                disabled={!hasContacts || !hasMessage}
                className="w-full text-center text-xs font-semibold text-brand-blue transition-opacity hover:underline disabled:opacity-40"
              >
                {copiedKey === "all" ? "¡Copiado!" : "Copiar mensaje y números juntos"}
              </button>
            </div>

            <div className="rounded-2xl border border-gray-100">
              <button onClick={() => setShowHow((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-brand-dark">
                ¿Cómo lo envío por WhatsApp Business?
                <ChevronDown className={`h-4 w-4 text-brand-gray transition-transform ${showHow ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
              {showHow && (
                <div className="space-y-2.5 border-t border-gray-100 px-4 py-3 text-xs leading-relaxed text-brand-gray">
                  <p>
                    <span className="font-bold text-brand-dark">1.</span> Guarda los números en la agenda de contactos de tu teléfono. WhatsApp solo entrega el mensaje a quienes{" "}
                    <span className="font-semibold text-brand-dark">tienen guardado tu número</span> en el suyo.
                  </p>
                  <p>
                    <span className="font-bold text-brand-dark">2.</span> En la app de WhatsApp Business, desde tus chats, crea una <span className="font-semibold text-brand-dark">lista de difusión</span> (opción &quot;Nueva difusión&quot;) y agrega a los contactos. Cada lista admite hasta {WA_LIST_LIMIT}.
                  </p>
                  <p>
                    <span className="font-bold text-brand-dark">3.</span> Abre la lista, pega el mensaje copiado y envíalo. Cada cliente lo recibe como un chat individual.
                  </p>
                  <p className="rounded-lg bg-brand-light px-3 py-2">
                    Las listas de difusión solo funcionan desde la app del teléfono (no en WhatsApp Web ni escritorio). Los nombres de los menús pueden variar según tu versión y sistema: revisa la{" "}
                    <a href="https://faq.whatsapp.com/653415899610349" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue hover:underline">
                      ayuda oficial de WhatsApp Business
                    </a>
                    . Envía solo a clientes que aceptaron recibir tus mensajes: WhatsApp puede limitar cuentas que envían promociones no solicitadas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
