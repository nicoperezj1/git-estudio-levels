"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Send, SlidersHorizontal, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/components/layout/notification-bell";
import { cn } from "@/lib/utils";

interface Item { id: string; kind: string; title: string; body: string | null; url: string | null; requires_ack: boolean; read_at: string | null; ack_at: string | null; created_by_name: string | null; created_at: string }
interface Sent { groupId: string; title: string; body: string | null; requiresAck: boolean; createdAt: string; total: number; read: number; acked: number }
interface Prefs { mutedKinds: string[]; quietStart: string; quietEnd: string; hideDetails: boolean; kinds: Array<{ key: string; label: string; essential: boolean }> }
interface Person { id: string; name: string; role: string }

const notify = () => window.dispatchEvent(new Event("rb:notifications-changed"));

export default function AvisosPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";
  const { showToast } = useToast();
  const [tab, setTab] = useState<"inbox" | "prefs" | "send">("inbox");
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Recibidos
  const [items, setItems] = useState<Item[]>([]);
  const loadInbox = useCallback(async () => {
    const r = await fetch("/api/notificaciones", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setEnabled(!!d.enabled);
    setItems(Array.isArray(d.items) ? d.items : []);
  }, []);
  useEffect(() => { loadInbox(); }, [loadInbox]);

  const post = async (payload: any) => {
    await fetch("/api/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await loadInbox(); notify();
  };

  // Preferencias
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  useEffect(() => { if (tab === "prefs" && !prefs) fetch("/api/notificaciones/preferencias").then((r) => r.json()).then(setPrefs).catch(() => {}); }, [tab, prefs]);
  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const r = await fetch("/api/notificaciones/preferencias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prefs) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo guardar");
      showToast("Preferencias guardadas", "success");
    } catch (e: any) { showToast(e?.message || "No se pudo guardar", "error"); } finally { setSavingPrefs(false); }
  };

  // Enviar (admin)
  const [people, setPeople] = useState<Person[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" as "all" | "barbers" | "receptionists" | "people", userIds: [] as string[], requiresAck: false });
  const [sending, setSending] = useState(false);
  const loadSent = useCallback(async () => {
    const r = await fetch("/api/avisos"); const d = await r.json().catch(() => ({})); setSent(Array.isArray(d.sent) ? d.sent : []);
  }, []);
  useEffect(() => {
    if (tab !== "send" || !isAdmin) return;
    loadSent();
    fetch("/api/barberos").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : d?.barbers || [];
      setPeople(list.filter((p: any) => p.active !== false).map((p: any) => ({ id: p.id, name: p.name, role: p.role })));
    }).catch(() => {});
  }, [tab, isAdmin, loadSent]);
  const send = async () => {
    setSending(true);
    try {
      const r = await fetch("/api/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo enviar");
      showToast(`Aviso enviado a ${d.recipients} persona${d.recipients === 1 ? "" : "s"}`, "success");
      setForm({ ...form, title: "", body: "", userIds: [] });
      loadSent();
    } catch (e: any) { showToast(e?.message || "No se pudo enviar", "error"); } finally { setSending(false); }
  };

  const tabs = [
    { key: "inbox" as const, label: "Recibidos", icon: Inbox },
    { key: "prefs" as const, label: "Preferencias", icon: SlidersHorizontal },
    ...(isAdmin ? [{ key: "send" as const, label: "Enviar aviso", icon: Send }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand-dark md:text-2xl"><Bell className="h-6 w-6" /> Avisos</h1>
        <p className="text-sm text-brand-gray">Lo que te llega del negocio y del administrador.</p>
      </div>

      {enabled === false && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Los avisos no están activados en tu negocio. {isAdmin ? "Actívalos en Configuración > Avisos y notificaciones." : "Pídele al administrador que los active."}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold", tab === t.key ? "border-brand-blue bg-brand-blue text-white" : "border-gray-200 text-brand-dark")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "inbox" && (
        <div className="space-y-2">
          {items.some((i) => !i.read_at) && <button onClick={() => post({ action: "read", all: true })} className="text-sm font-semibold text-brand-blue hover:underline">Marcar todos como leídos</button>}
          {items.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-brand-gray">No tienes avisos todavía.</p>
          ) : items.map((it) => (
            <div key={it.id} className={cn("rounded-xl border border-gray-100 bg-white p-4", !it.read_at && "border-brand-blue/30 bg-brand-blue/5")}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-brand-dark">{it.title}</p>
                <span className="whitespace-nowrap text-[11px] text-brand-gray">{timeAgo(it.created_at)}</span>
              </div>
              {it.body && <p className="mt-1 whitespace-pre-wrap text-sm text-brand-gray">{it.body}</p>}
              {it.created_by_name && <p className="mt-1 text-[11px] text-brand-gray">De {it.created_by_name}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {it.requires_ack && !it.ack_at && <button onClick={() => post({ action: "ack", id: it.id })} className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white">Entendido</button>}
                {it.requires_ack && it.ack_at && <span className="text-xs font-semibold text-emerald-600">✓ Confirmado</span>}
                {!it.read_at && !it.requires_ack && <button onClick={() => post({ action: "read", ids: [it.id] })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-brand-dark">Marcar leído</button>}
                {it.url && <a href={it.url} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-brand-dark">Abrir</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "prefs" && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4">
          {!prefs ? <p className="text-sm text-brand-gray">Cargando…</p> : (
            <>
              <div>
                <p className="mb-1 text-sm font-semibold text-brand-dark">¿Qué avisos quieres recibir?</p>
                <div className="space-y-1">
                  {prefs.kinds.map((k) => {
                    const on = k.essential || !prefs.mutedKinds.includes(k.key);
                    return (
                      <label key={k.key} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-sm text-brand-dark">{k.label}{k.essential && <span className="ml-1 text-[11px] text-brand-gray">(siempre)</span>}</span>
                        <input type="checkbox" checked={on} disabled={k.essential} className="h-5 w-5"
                          onChange={(e) => setPrefs({ ...prefs, mutedKinds: e.target.checked ? prefs.mutedKinds.filter((x) => x !== k.key) : [...prefs.mutedKinds, k.key] })} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-dark">Horario de silencio</p>
                <p className="mb-2 text-xs text-brand-gray">En ese horario los avisos no suenan, pero quedan en tu bandeja. Hora de Chile.</p>
                <div className="flex items-center gap-2">
                  <input type="time" value={prefs.quietStart} onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <span className="text-sm text-brand-gray">a</span>
                  <input type="time" value={prefs.quietEnd} onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  {(prefs.quietStart || prefs.quietEnd) && <button onClick={() => setPrefs({ ...prefs, quietStart: "", quietEnd: "" })} className="text-xs font-semibold text-brand-blue">Quitar</button>}
                </div>
              </div>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={prefs.hideDetails} onChange={(e) => setPrefs({ ...prefs, hideDetails: e.target.checked })} className="mt-0.5 h-5 w-5" />
                <span>
                  <span className="block text-sm font-medium text-brand-dark">Ocultar detalles en la pantalla bloqueada</span>
                  <span className="block text-xs text-brand-gray">El aviso dirá "Nueva cita agendada" sin nombre del cliente. El detalle lo ves al abrir la app.</span>
                </span>
              </label>
              <button onClick={savePrefs} disabled={savingPrefs} className="rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingPrefs ? "Guardando…" : "Guardar preferencias"}</button>
            </>
          )}
        </div>
      )}

      {tab === "send" && isAdmin && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
            <label className="block text-xs font-medium text-brand-gray">Título
              <input id="aviso-titulo" value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Reunión de equipo el lunes" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="block text-xs font-medium text-brand-gray">Mensaje (opcional)
              <textarea id="aviso-mensaje" rows={3} value={form.body} maxLength={1000} onChange={(e) => setForm({ ...form, body: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <div>
              <p className="mb-1 text-xs font-medium text-brand-gray">¿A quién?</p>
              <div className="flex flex-wrap gap-2">
                {([["all", "Todo el equipo"], ["barbers", "Profesionales"], ["receptionists", "Recepción"], ["people", "Personas…"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setForm({ ...form, audience: k })} className={cn("rounded-full border px-3 py-1.5 text-sm", form.audience === k ? "border-brand-blue bg-brand-blue text-white" : "border-gray-200 text-brand-dark")}>{label}</button>
                ))}
              </div>
              {form.audience === "people" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {people.map((p) => {
                    const on = form.userIds.includes(p.id);
                    return <button key={p.id} type="button" onClick={() => setForm({ ...form, userIds: on ? form.userIds.filter((x) => x !== p.id) : [...form.userIds, p.id] })} className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-brand-dark")}>{p.name}</button>;
                  })}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-dark">
              <input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} className="h-5 w-5" />
              Pedir confirmación de lectura ("Entendido")
            </label>
            <button onClick={send} disabled={sending || !form.title.trim()} className="w-full rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{sending ? "Enviando…" : "Enviar aviso"}</button>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-brand-dark">Enviados</p>
            {sent.length === 0 ? <p className="text-sm text-brand-gray">Aún no has enviado avisos.</p> : (
              <div className="space-y-2">
                {sent.map((s) => (
                  <div key={s.groupId} className="rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-sm font-semibold text-brand-dark">{s.title}</p>
                    <p className="text-xs text-brand-gray">{timeAgo(s.createdAt)} · {s.read} de {s.total} lo leyeron{s.requiresAck ? ` · ${s.acked} confirmaron` : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
