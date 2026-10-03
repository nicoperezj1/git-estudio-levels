// Ventas de SERVICIOS por profesional en un mes (para la recomendacion "por estadisticas").
import { fetchAllRows, monthEnd } from "@/lib/accounting";
import { chileDayBoundsUtc } from "@/lib/utils";

export async function serviceSalesByPro(supabase: any, tenantId: string, firstDay: string): Promise<Record<string, number>> {
  const startUtc = chileDayBoundsUtc(firstDay).startUtc;
  const endUtc = chileDayBoundsUtc(monthEnd(firstDay)).endUtc;
  const rows = await fetchAllRows<any>(() =>
    supabase.from("transactions").select("id, barber_id, items:transaction_items(total, service_id)")
      .eq("tenant_id", tenantId).eq("type", "income").eq("status", "completed")
      .gte("created_at", startUtc).lt("created_at", endUtc)
  ).catch(() => [] as any[]);
  const out: Record<string, number> = {};
  for (const t of rows) {
    if (!t.barber_id) continue;
    for (const it of t.items || []) if (it.service_id) out[t.barber_id] = (out[t.barber_id] || 0) + Number(it.total || 0);
  }
  return out;
}

// Primer dia del mes anterior a `date` (YYYY-MM-DD).
export function previousMonthStart(date: string): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}
