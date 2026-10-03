"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/premium";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Req {
  id: string; created_by_name: string | null; created_at: string; notes: string | null; email_sent: boolean; email_to?: string | null;
  items: Array<{ name: string; current_stock: number | null; to_buy: number }>;
}

// Solicitudes de insumos que levanto recepcion: quedan aqui hasta que el administrador las borra a mano.
// Si no hay ninguna, no muestra nada (no ocupa espacio en el Dashboard).
export function SupplyRequestsCard({ tenantId }: { tenantId?: string }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const qs = tenantId ? `?tenantId=${tenantId}` : "";

  const load = () => fetch(`/api/solicitudes-insumos${qs}`).then((r) => r.json()).then((d) => setReqs(d.requests || [])).catch(() => setReqs([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tenantId]);

  const remove = async (id: string) => {
    const ok = await confirm({ title: "Borrar solicitud", message: "Ya compraste estos insumos o no hace falta la solicitud. Se quita del Dashboard.", confirmText: "Borrar", variant: "warning" });
    if (!ok) return;
    const res = await fetch(`/api/solicitudes-insumos?id=${id}${tenantId ? `&tenantId=${tenantId}` : ""}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo borrar", "error"); return; }
    setReqs((r) => r.filter((x) => x.id !== id));
  };

  if (reqs.length === 0) return null;
  return (
    <Panel title="Solicitudes de insumos" subtitle="Recepción solicitó estos insumos. Se quedan aquí hasta que los borres.">
      <div className="space-y-3">
        {reqs.map((r) => (
          <div key={r.id} className="rounded-xl bg-brand-light/60 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-brand-gray">
                {r.created_by_name || "Recepción"} · {new Date(r.created_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long" })}
              </p>
              <button onClick={() => remove(r.id)} className="text-xs font-semibold text-red-500 hover:underline">Borrar</button>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-sm text-brand-dark">
              {r.items.map((i, k) => (
                <li key={k} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{i.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <b>{i.to_buy}</b> <span className="text-[11px] text-brand-gray">{i.current_stock === null ? "" : `(hay ${i.current_stock})`}</span>
                  </span>
                </li>
              ))}
            </ul>
            {r.notes && <p className="mt-1.5 text-xs text-brand-gray">Nota: {r.notes}</p>}
            {/* Para saber si el correo salio o no (no es evidente mirando el Dashboard). */}
            <p className={`mt-1.5 text-[11px] ${r.email_sent ? "text-emerald-600" : "text-amber-600"}`}>
              {r.email_sent ? `Correo enviado a ${r.email_to || "el administrador"}` : "El correo no se pudo enviar (la solicitud sí quedó guardada aquí)."}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
