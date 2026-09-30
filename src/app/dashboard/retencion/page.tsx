"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Users, UserMinus, Percent, Mail, MessageCircle, HeartHandshake, Send } from "lucide-react";
import { PageHeader, StatCard, Panel, primaryButton, ghostButton, inputClass } from "@/components/ui/premium";
import { MessageQuotaBar } from "@/components/dashboard/message-quota-bar";
import { formatPhoneCL } from "@/lib/phone";

interface InactiveClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lastVisit: string | null;
  totalVisits: number;
  daysSinceVisit: number;
}

const DAY_PRESETS = [15, 30, 45, 60, 90, 120, 180, 365];

export default function RetencionPage() {
  const [clients, setClients] = useState<InactiveClient[]>([]);
  const [stats, setStats] = useState({ total: 0, inactive: 0, percentage: 0, contactable: 0 });
  const [quotaRefresh, setQuotaRefresh] = useState(0);
  const [days, setDays] = useState(30);
  // Punto 12 (Pablo): "Personalizado..." ponia days=0, y el input numerico solo se
  // mostraba mientras days===0 — apenas se escribia un numero valido, days dejaba de
  // ser 0 y esa misma condicion hacia desaparecer el input a mitad de tipeo ("me saca
  // de la seleccion"). El modo personalizado ahora es un estado propio, independiente
  // del valor de days que dispara la busqueda.
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Array<{ code: string; description: string }>>([]);
  const [selectedCoupon, setSelectedCoupon] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Ask the server WHO would receive this (scoped to the business), show a sample and
  // the exact count, and only send after an explicit confirmation. This is the guard
  // against the "sent to 647 people by one click" incident.
  const sendBulkEmail = async () => {
    setBulkSending(true);
    try {
      const previewRes = await fetch("/api/retention/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, couponCode: selectedCoupon || null, message: customMessage || null, type: "email", preview: true }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) { showToast(preview.error || "No se pudo preparar el envio", "error"); return; }
      if (!preview.total) { showToast("No hay clientes con email para enviar", "info"); return; }

      const sampleNames = (preview.sample || []).map((s: any) => `• ${s.name} (${s.email})`).join("\n");
      const ok = await confirm({
        title: `Enviar ${preview.total} correo${preview.total === 1 ? "" : "s"}?`,
        message: `Se enviara un correo a ${preview.total} cliente${preview.total === 1 ? "" : "s"} de tu negocio. Ejemplos:\n\n${sampleNames}${preview.total > 5 ? `\n… y ${preview.total - 5} mas` : ""}\n\nEsta accion no se puede deshacer.`,
        confirmText: `Si, enviar ${preview.total}`,
        variant: "warning",
      });
      if (!ok) return;

      const res = await fetch("/api/retention/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, couponCode: selectedCoupon || null, message: customMessage || null, type: "email" }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Error al enviar", "error"); return; }
      showToast(
        data.quotaExceeded
          ? `Se enviaron ${data.sent || 0} de ${data.total || 0} correos: se agotó tu cupo de correos de este ciclo.`
          : `${data.sent || 0} de ${data.total || 0} correos enviados`,
        data.quotaExceeded ? "info" : "success"
      );
      setQuotaRefresh((k) => k + 1);
    } catch {
      showToast("Error al enviar", "error");
    } finally {
      setBulkSending(false);
    }
  };

  // Copiar lista para una Lista de difusion de WhatsApp. Primero se pide una vista previa
  // (sin gastar cupo) y se confirma; recien ahi se generan los mensajes, que si descuentan cupo.
  const copyForBroadcast = async () => {
    setBulkSending(true);
    try {
      const body = { days, couponCode: selectedCoupon || null, message: customMessage || null, type: "whatsapp" };
      const previewRes = await fetch("/api/retention/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, preview: true }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) { showToast(preview.error || "No se pudo preparar la lista", "error"); return; }
      if (!preview.total) { showToast("No hay clientes con teléfono para copiar", "info"); return; }

      const ok = await confirm({
        title: `Copiar ${preview.total} contacto${preview.total === 1 ? "" : "s"}?`,
        message: `Se preparará el mensaje para ${preview.total} cliente${preview.total === 1 ? "" : "s"} y se descontará ${preview.total} del cupo de WhatsApp de este ciclo.`,
        confirmText: `Sí, copiar ${preview.total}`,
        variant: "warning",
      });
      if (!ok) return;

      const res = await fetch("/api/retention/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Error al preparar la lista", "error"); return; }
      if (data.links && data.links.length > 0) {
        const phones = data.links.map((l: any) => formatPhoneCL(l.phone)).join("\n");
        const msg = customMessage || "Te extrañamos! Agenda tu cita.";
        const fullText = `MENSAJE:\n${msg}${selectedCoupon ? `\n\nCupon: ${selectedCoupon}` : ""}\n\n---\nDESTINATARIOS (${data.links.length}):\n${phones}`;
        await navigator.clipboard.writeText(fullText);
        showToast(
          data.quotaExceeded
            ? `Se copiaron ${data.links.length} contactos: se agotó tu cupo de WhatsApp de este ciclo.`
            : `Lista de ${data.links.length} contactos copiada. Pégala en tu Lista de difusión de WhatsApp Business.`,
          data.quotaExceeded ? "info" : "success"
        );
      } else if (data.quotaExceeded) {
        showToast("Se agotó tu cupo de WhatsApp de este ciclo.", "error");
      }
      setQuotaRefresh((k) => k + 1);
    } catch {
      showToast("Error al preparar la lista", "error");
    } finally {
      setBulkSending(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const [retRes, coupRes] = await Promise.all([
      fetch(`/api/retention?days=${days}`),
      fetch("/api/cupones"),
    ]);
    const retData = await retRes.json();
    const coupData = await coupRes.json();
    setClients(retData.clients || []);
    setStats(retData.stats || { total: 0, inactive: 0, percentage: 0, contactable: 0 });
    setCoupons(Array.isArray(coupData) ? coupData : []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [days]);

  const notifyClient = async (clientId: string, type: "email" | "whatsapp") => {
    setSendingId(`${clientId}-${type}`);
    const res = await fetch("/api/retention/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        type,
        couponCode: selectedCoupon || null,
        message: customMessage || null,
      }),
    });
    const data = await res.json();
    setSendingId(null);

    if (data.success) {
      if (type === "whatsapp" && data.url) {
        window.open(data.url, "_blank");
        showToast("WhatsApp abierto", "success");
      } else {
        showToast("Email enviado", "success");
      }
      setQuotaRefresh((k) => k + 1);
    } else {
      showToast(data.error || "Error al notificar", "error");
    }
  };

  const withEmail = clients.filter((c) => c.email).length;
  const withPhone = clients.filter((c) => c.phone).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 animate-fade-in">
      <PageHeader
        title="Retención de clientes"
        subtitle="Recupera a los clientes que hace tiempo no vuelven"
        actions={
          clients.length > 0 ? (
            <>
              <button onClick={copyForBroadcast} disabled={bulkSending || withPhone === 0} className={ghostButton}>
                <MessageCircle className="h-4 w-4 text-emerald-500" strokeWidth={2} /> Copiar para difusión ({withPhone})
              </button>
              <button onClick={sendBulkEmail} disabled={bulkSending || withEmail === 0} className={primaryButton}>
                <Send className="h-4 w-4" strokeWidth={2} /> {bulkSending ? "Procesando..." : `Email masivo (${withEmail})`}
              </button>
            </>
          ) : undefined
        }
      />

      <MessageQuotaBar refreshKey={quotaRefresh} />

      {/* Metricas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de clientes" value={stats.total} Icon={Users} tone="teal" hint="Registrados en tu negocio" />
        <StatCard label={`Inactivos (${days}+ días)`} value={stats.inactive} Icon={UserMinus} tone="amber" hint="Sin visita ni cita por venir" />
        <StatCard label="% inactivos" value={`${stats.percentage}%`} Icon={Percent} tone={stats.percentage >= 30 ? "red" : "green"} hint="Del total de clientes" />
        <StatCard label="Contactables" value={stats.contactable} Icon={HeartHandshake} tone="green" hint="Con correo o teléfono" />
      </div>

      {/* Filtros y mensaje */}
      <Panel title="A quién y qué decirles">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-gray">Días sin visita</p>
            <div className="-mx-1 flex flex-wrap gap-2 px-1">
              {DAY_PRESETS.map((d) => {
                const active = !isCustomDays && days === d;
                return (
                  <button
                    key={d}
                    onClick={() => { setIsCustomDays(false); setDays(d); }}
                    className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-all ${
                      active ? "border-transparent bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/40"
                    }`}
                  >
                    {d} días
                  </button>
                );
              })}
              {/* Punto 12 (Pablo): el modo personalizado es un estado propio, para que el input
                  no desaparezca mientras se escribe. */}
              <button
                onClick={() => { setIsCustomDays(true); setCustomDaysInput(""); }}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-all ${
                  isCustomDays ? "border-transparent bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/40"
                }`}
              >
                Personalizado
              </button>
              {isCustomDays && (
                <input
                  type="number"
                  min={1}
                  max={999}
                  placeholder="Días"
                  value={customDaysInput}
                  onChange={(e) => setCustomDaysInput(e.target.value)}
                  onBlur={() => { const v = parseInt(customDaysInput); if (v > 0) setDays(v); }}
                  onKeyDown={(e) => { if (e.key !== "Enter") return; const v = parseInt(customDaysInput); if (v > 0) setDays(v); }}
                  className="w-24 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-brand-blue"
                />
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Cupón a incluir</label>
              <select value={selectedCoupon} onChange={(e) => setSelectedCoupon(e.target.value)} className={inputClass}>
                <option value="">Sin cupón</option>
                {coupons.map((c: any) => (
                  <option key={c.code} value={c.code}>{c.code} - {c.description}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Mensaje personalizado</label>
              <input
                type="text"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Te extrañamos! Vuelve pronto..."
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Lista */}
      <Panel title={`Clientes inactivos (${clients.length})`} subtitle="Ordenados del más antiguo al más reciente" flush>
        {loading ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center px-6 pb-10 pt-4 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <HeartHandshake className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-brand-dark">¡Todos al día!</p>
            <p className="mt-1 text-xs text-brand-gray">No hay clientes con {days} días o más sin volver.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 px-2 pb-2 md:px-3">
            {clients.map((c) => {
              const initials = c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              const tone = c.daysSinceVisit >= 60 ? "bg-red-500/15 text-red-500" : c.daysSinceVisit >= 30 ? "bg-amber-500/15 text-amber-500" : "bg-brand-light text-brand-gray";
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-3.5 transition-colors hover:bg-brand-blue/[0.04] md:flex-nowrap">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue/25 to-brand-accent/10 text-sm font-bold text-brand-blue ring-1 ring-brand-blue/20">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-semibold capitalize text-brand-dark">{c.name}</p>
                    <p className="truncate text-xs text-brand-gray">
                      {c.email || "Sin correo"}{c.phone ? ` · ${formatPhoneCL(c.phone)}` : " · Sin teléfono"}
                    </p>
                  </div>
                  <div className="hidden w-24 text-center md:block">
                    <p className="text-sm font-bold tabular-nums text-brand-dark">{c.totalVisits}</p>
                    <p className="text-[10px] uppercase tracking-wide text-brand-gray">{c.totalVisits === 1 ? "visita" : "visitas"}</p>
                  </div>
                  <div className="hidden w-28 text-center md:block">
                    <p className="text-sm font-semibold text-brand-dark">{c.lastVisit ? new Date(c.lastVisit + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "Nunca"}</p>
                    <p className="text-[10px] uppercase tracking-wide text-brand-gray">última visita</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums ${tone}`}>
                    {c.daysSinceVisit} {c.daysSinceVisit === 1 ? "día" : "días"}
                  </span>
                  <div className="flex flex-shrink-0 gap-2">
                    {c.phone && (
                      <button
                        onClick={() => notifyClient(c.id, "whatsapp")}
                        disabled={sendingId === `${c.id}-whatsapp`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500 ring-1 ring-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} /> WhatsApp
                      </button>
                    )}
                    {c.email && (
                      <button
                        onClick={() => notifyClient(c.id, "email")}
                        disabled={sendingId === `${c.id}-email`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-brand-dark transition-colors hover:border-brand-blue/40 disabled:opacity-50"
                      >
                        <Mail className="h-3.5 w-3.5" strokeWidth={2} /> {sendingId === `${c.id}-email` ? "..." : "Email"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
