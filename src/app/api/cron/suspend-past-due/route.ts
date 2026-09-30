import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// Vercel Cron: revisa suscripciones en "past_due" (una renovacion fallo) cuyo
// grace_until ya paso (2 dias de gracia, ver doc de spec) y suspende el tenant.
// Mercado Pago reintenta el cobro automatico varias veces durante esos 2 dias; si
// alguno de esos reintentos aprueba, el webhook (subscribe/webhook) limpia
// status/grace_until antes de que este cron actue.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  const { data: overdue } = await supabase
    .from("subscriptions")
    .select("id, tenant_id")
    .eq("status", "past_due")
    .lt("grace_until", now);

  if (!overdue?.length) {
    return NextResponse.json({ suspended: 0 });
  }

  const tenantIds = overdue.map((s: any) => s.tenant_id).filter(Boolean);

  // Suspende el tenant (bloquea acceso) — no se toca la suscripcion en Mercado Pago
  // aqui: si el negocio actualiza su tarjeta y paga, el webhook reactiva todo.
  await supabase.from("tenants").update({ status: "suspended" }).in("id", tenantIds);

  return NextResponse.json({ suspended: tenantIds.length });
}
