import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { computeProMonths, isLedgerEnabled, type ProMode } from "@/lib/ledger";

// Lectura del libro de movimientos por profesional y mes (Arriendo y Comision). Admin y recepcion.
// Si el negocio no tiene encendido el libro, responde enabled:false y las pantallas usan el calculo de siempre.
export async function GET(req: NextRequest) {
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") return NextResponse.json({ enabled: false, items: [] });
  if (!(await isLedgerEnabled(supabase, tenantId))) return NextResponse.json({ enabled: false, items: [] });

  const mode: ProMode = searchParams.get("mode") === "rental" ? "rental" : "commission";
  const [cy, cm] = todayInChile().split("-").map(Number);
  const month = Math.min(12, Math.max(1, parseInt(searchParams.get("month") || String(cm)) || cm));
  const year = parseInt(searchParams.get("year") || String(cy)) || cy;

  const items = await computeProMonths(supabase, { tenantId, mode, year, month });
  const totals = {
    total: items.reduce((s, i) => s + i.total, 0),
    paid: items.reduce((s, i) => s + i.paid, 0),
    pending: items.reduce((s, i) => s + i.pending, 0),
  };
  return NextResponse.json({ enabled: true, mode, items, totals, period: { month, year } });
}
