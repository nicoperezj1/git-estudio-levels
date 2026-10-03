import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { GET as cajaGET } from "../route";

// Reduccion de efectivo: cuando el efectivo de la caja supera el tope del negocio, quien esta en caja
// retira el excedente y lo deja en la caja fuerte. Se registra como retiro y se RESTA del efectivo
// esperado, asi la caja sigue cuadrando. El monto lo calcula el SERVIDOR (no se confia en el que
// manda el navegador): es lo que excede el tope. Un segundo toque no duplica el retiro porque ya
// no hay excedente.
export async function POST(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Con un problema de caja SIN resolver el efectivo del sistema no es confiable: no se pide reducir nada hasta que
  // el administrador declare el efectivo real (ahi la reduccion se calcula sobre el monto verdadero).
  {
    const sb = createAdminSupabase();
    const { data: open } = await sb.from("problem_reports").select("id").eq("tenant_id", tenantId).eq("status", "open")
      .in("context", ["caja", "standby", "reduccion_efectivo"]).limit(1);
    if (open && open.length > 0) {
      return NextResponse.json({ error: "Hay un problema de caja sin resolver: el administrador debe declarar el efectivo real antes de reducir." }, { status: 409 });
    }
  }

  // Mismo calculo de la caja de hoy que usa la pantalla Caja (una sola fuente de verdad).
  const r = await cajaGET(new NextRequest(new URL(`/api/caja?tenantId=${tenantId}`, req.url)));
  const state = await r.json().catch(() => null);
  const cap = Number(state?.summary?.cashCap);
  const expected = Number(state?.summary?.expectedCash);
  if (!Number.isFinite(cap) || cap <= 0) return NextResponse.json({ error: "Este negocio no tiene tope de efectivo." }, { status: 409 });
  if (!Number.isFinite(expected)) return NextResponse.json({ error: "No se pudo leer la caja." }, { status: 500 });
  const amount = Math.round(expected - cap);
  if (amount <= 0) return NextResponse.json({ error: "El efectivo no supera el tope. No hace falta reducir." }, { status: 409 });

  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({} as any));
  let byId: string = userId;
  if (body?.by && typeof body.by === "string") {
    const { data: p } = await supabase.from("profiles").select("id").eq("id", body.by).eq("tenant_id", tenantId).maybeSingle();
    if (p) byId = p.id;
  }
  const { data: me } = await supabase.from("profiles").select("name").eq("id", byId).maybeSingle();
  const { error } = await supabase.from("cash_withdrawals").insert({
    tenant_id: tenantId, day: todayInChile(), amount,
    note: "Reducción de efectivo a la caja fuerte",
    created_by: byId, created_by_name: me?.name || null,
  });
  if (error) return NextResponse.json({ error: "Falta aplicar la migración 094 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true, amount });
}
