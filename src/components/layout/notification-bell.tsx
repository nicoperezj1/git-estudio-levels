"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotificationCenter } from "@/lib/use-notification-center";
import { cn } from "@/lib/utils";

interface Item { id: string; kind: string; title: string; body: string | null; url: string | null; requires_ack: boolean; read_at: string | null; ack_at: string | null; created_at: string }

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

// Campanita con la bandeja de avisos. No se muestra si el negocio no activó el centro.
export function NotificationBell({ className }: { className?: string }) {
  const { enabled, unread, refresh } = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const router = useRouter();

  if (!enabled) return null;

  const load = async () => {
    try {
      const r = await fetch("/api/notificaciones", { cache: "no-store" });
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items.slice(0, 15) : []);
    } catch { setItems([]); }
  };
  const toggle = () => { const next = !open; setOpen(next); if (next) load(); };

  const post = async (payload: any) => {
    await fetch("/api/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    refresh();
  };
  const tap = async (it: Item) => {
    if (!it.read_at) await post({ action: "read", ids: [it.id] });
    setOpen(false);
    if (it.url) router.push(it.url);
  };
  const markAll = async () => { await post({ action: "read", all: true }); load(); };

  return (
    <div className={cn("relative", className)}>
      <button type="button" onClick={toggle} aria-label={`Avisos${unread ? `, ${unread} sin leer` : ""}`} className="relative flex h-10 w-10 items-center justify-center rounded-full text-brand-dark hover:bg-brand-light">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed left-3 right-3 top-16 z-[61] max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-xl dark:bg-brand-white lg:absolute lg:left-0 lg:right-auto lg:top-11 lg:w-80">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-bold text-brand-dark">Avisos</p>
              {unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-brand-blue hover:underline">Marcar todos como leídos</button>}
            </div>
            {items === null ? (
              <p className="px-4 py-6 text-center text-sm text-brand-gray">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-brand-gray">No tienes avisos todavía.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.map((it) => (
                  <li key={it.id}>
                    <button type="button" onClick={() => tap(it)} className={cn("block w-full px-4 py-3 text-left hover:bg-gray-50", !it.read_at && "bg-brand-blue/5")}>
                      <div className="flex items-start gap-2">
                        {!it.read_at && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-blue" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-brand-dark">{it.title}</p>
                          {it.body && <p className="line-clamp-2 text-xs text-brand-gray">{it.body}</p>}
                          <p className="mt-0.5 text-[11px] text-brand-gray">
                            {timeAgo(it.created_at)}{it.requires_ack && !it.ack_at ? " · pide confirmación" : ""}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/avisos" onClick={() => setOpen(false)} className="block border-t border-gray-100 px-4 py-3 text-center text-sm font-semibold text-brand-blue hover:bg-gray-50">Ver todos y preferencias</Link>
          </div>
        </>
      )}
    </div>
  );
}
