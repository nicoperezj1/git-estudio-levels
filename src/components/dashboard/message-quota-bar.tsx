"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Mail, Gauge } from "lucide-react";

// Contador de cupo de mensajeria ("tokens") del negocio: cuantos WhatsApp y correos quedan
// en el ciclo. Misma fuente que Configuracion (GET /api/message-quota). Se usa en Retencion
// y en Mensajes por WhatsApp. `refreshKey` vuelve a consultar despues de enviar.

interface Status { limit: number | null; used: number; remaining: number | null; cycleStart: string }

export function MessageQuotaBar({ channels = ["whatsapp", "email"], refreshKey = 0 }: { channels?: Array<"whatsapp" | "email">; refreshKey?: number }) {
  const [quota, setQuota] = useState<{ whatsapp: Status | null; email: Status | null } | null>(null);

  useEffect(() => {
    fetch("/api/message-quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuota(d && !d.error ? d : null))
      .catch(() => setQuota(null));
  }, [refreshKey]);

  if (!quota) return null;
  const rows = ([
    { key: "whatsapp" as const, label: "WhatsApp", Icon: MessageCircle, status: quota.whatsapp, bar: "bg-emerald-500" },
    { key: "email" as const, label: "Correos", Icon: Mail, status: quota.email, bar: "bg-brand-blue" },
  ]).filter((r) => channels.includes(r.key) && r.status);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
          <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-dark">Cupo de mensajes</h3>
          <Gauge className="h-4 w-4 text-brand-gray" strokeWidth={1.75} />
        </div>
        <Link href="/dashboard/configuracion" className="text-xs font-semibold text-brand-blue hover:underline">Ver plan</Link>
      </div>
      <div className={`grid gap-4 ${rows.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {rows.map(({ key, label, Icon, status, bar }) => {
          const s = status!;
          const unlimited = s.limit === null;
          const pct = unlimited ? 0 : Math.min(100, Math.round((s.used / Math.max(s.limit!, 1)) * 100));
          const exhausted = !unlimited && (s.remaining ?? 0) <= 0;
          const low = !unlimited && !exhausted && (s.remaining ?? 0) <= Math.max(1, Math.round((s.limit || 0) * 0.1));
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-brand-dark">
                  <Icon className="h-4 w-4 text-brand-gray" strokeWidth={1.75} /> {label}
                </span>
                <span className="text-xs tabular-nums text-brand-gray">
                  {unlimited ? "Ilimitado" : <><span className="font-bold text-brand-dark">{s.remaining}</span> de {s.limit} restantes</>}
                </span>
              </div>
              {!unlimited && (
                <div className="h-2 overflow-hidden rounded-full bg-brand-light">
                  <div
                    className={`h-full rounded-full transition-all ${exhausted ? "bg-red-500" : low ? "bg-amber-500" : bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {exhausted && <p className="text-[11px] font-medium text-red-500">Cupo agotado: los envíos quedan pausados hasta el próximo ciclo.</p>}
              {low && <p className="text-[11px] font-medium text-amber-500">Quedan pocos mensajes este ciclo.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
