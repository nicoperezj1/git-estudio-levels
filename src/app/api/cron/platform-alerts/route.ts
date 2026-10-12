import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { notifyPlatform } from "@/lib/platform-alerts";

// Vercel Cron (diario): avisa a los super admin de lo que esta por vencer.
//   - Pruebas gratis (trial) que terminan en 3 y 1 dia.
//   - Planes anuales (pago unico, no se renuevan solos) que vencen en 7 y 1 dia.
// Corre una vez al dia, asi que cada aviso sale una sola vez por negocio. No avisa nada de lo que pasa
// dentro de los negocios (citas, clientes, ventas).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = Date.now();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("tenant_id, plan, status, billing_period, mp_preapproval_id, current_period_end")
    .in("status", ["trial", "active"]);

  const ids = Array.from(new Set(((subs || []) as any[]).map((s) => s.tenant_id).filter(Boolean)));
  const { data: tenantRows } = ids.length > 0 ? await supabase.from("tenants").select("id, name").in("id", ids) : { data: [] as any[] };
  const names = new Map<string, string>((tenantRows || []).map((t: any) => [t.id, t.name]));

  const trial: string[] = [];
  const annual: string[] = [];
  let sent = 0;

  for (const s of (subs || []) as any[]) {
    if (!s.current_period_end) continue;
    const daysLeft = Math.ceil((new Date(s.current_period_end).getTime() - now) / 86400000);
    const name = names.get(s.tenant_id) || "Un negocio";
    if (s.status === "trial" && (daysLeft === 3 || daysLeft === 1)) {
      trial.push(`${name} (${daysLeft === 1 ? "mañana" : "en 3 días"})`);
    } else if (s.status === "active" && s.billing_period === "annual" && !s.mp_preapproval_id && (daysLeft === 7 || daysLeft === 1)) {
      annual.push(`${name} (${daysLeft === 1 ? "mañana" : "en 7 días"})`);
    }
  }

  if (trial.length > 0) {
    await notifyPlatform({
      kind: "trial_ending",
      title: trial.length === 1 ? "Termina la prueba gratis de un negocio" : `Terminan ${trial.length} pruebas gratis`,
      body: trial.join(", "),
    });
    sent++;
  }
  if (annual.length > 0) {
    await notifyPlatform({
      kind: "plan_ending",
      title: annual.length === 1 ? "Vence el plan anual de un negocio" : `Vencen ${annual.length} planes anuales`,
      body: annual.join(", "),
    });
    sent++;
  }

  return NextResponse.json({ trial: trial.length, annual: annual.length, sent });
}
