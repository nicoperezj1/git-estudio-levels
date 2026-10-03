import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";
import { isLedgerEnabled } from "@/lib/ledger";
import { monthStart } from "@/lib/accounting";

// Lo "pagado" (comision) / "cobrado" (arriendo) por profesional y mes. Se puede corregir aunque ya diga
// pagado/cobrado; cada cambio guarda el valor anterior, el nuevo, quien lo hizo y cuando. Solo administrador.

const mon = (y: any, m: any) => monthStart(`${y}-${String(m).padStart(2, "0")}`);

export async function GET(req: NextRequest) {
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const month = mon(searchParams.get("year"), searchParams.get("month"));
  const barberId = searchParams.get("barberId");
  const mode = searchParams.get("mode") === "rental" ? "rental" : "commission";
  if (denied || !tenantId || tenantId === "ALL" || !month || !barberId) return NextResponse.json({ log: [] });

  const supabase = createAdminSupabase();
  const { data } = await supabase.from("professional_settlement_log")
    .select("old_amount, new_amount, note, user_name, created_at")
    .eq("tenant_id", tenantId).eq("barber_id", barberId).eq("month", month).eq("mode", mode)
    .order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ log: data || [] });
}

export async function PUT(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  if (caller.role !== "admin" && caller.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { tenantId, denied } = await resolveTenantForRequest(body?.tenantId);
  const month = mon(body?.year, body?.month);
  const mode = body?.mode === "rental" ? "rental" : "commission";
  const amount = Math.round(Number(body?.amount));
  if (denied || !tenantId || tenantId === "ALL" || !month || !body?.barberId || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  }
  const supabase = createAdminSupabase();
  if (!(await isLedgerEnabled(supabase, tenantId))) {
    return NextResponse.json({ error: "El libro de movimientos no esta activado para este negocio." }, { status: 409 });
  }
  const { data: pro } = await supabase.from("profiles").select("id").eq("id", body.barberId).eq("tenant_id", tenantId).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { data: prev } = await supabase.from("professional_settlements").select("amount_paid")
    .eq("tenant_id", tenantId).eq("barber_id", body.barberId).eq("month", month).eq("mode", mode).maybeSingle();

  const { error } = await supabase.from("professional_settlements").upsert({
    tenant_id: tenantId, barber_id: body.barberId, month, mode, amount_paid: amount,
    paid_at: amount > 0 ? new Date().toISOString() : null, updated_by_name: me?.name || null, updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,barber_id,month,mode" });
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 091 en la base de datos." }, { status: 409 });

  await supabase.from("professional_settlement_log").insert({
    tenant_id: tenantId, barber_id: body.barberId, month, mode,
    old_amount: prev ? Number(prev.amount_paid) : null, new_amount: amount,
    note: String(body?.note || "").trim() || null, user_id: caller.userId, user_name: me?.name || null,
  });
  return NextResponse.json({ success: true });
}

// Arriendo: dias trabajados y valor del dia del mes. Dias, tres formas: `dates` (dias elegidos en el calendario), `days` (solo la cantidad) o
// ninguno de los dos (vuelve al calculo automatico). No toca rental_records, para que apagar el libro no cambie los
// numeros de antes. Solo administrador.
export async function PATCH(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  if (caller.role !== "admin" && caller.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { tenantId, denied } = await resolveTenantForRequest(body?.tenantId);
  const month = mon(body?.year, body?.month);
  if (denied || !tenantId || tenantId === "ALL" || !month || !body?.barberId) {
    return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  }

  // Solo se cambia lo que viene en la peticion: `dates` / `days` / `auto` (dias trabajados) y/o `dailyRate` (valor del dia).
  const update: Record<string, any> = {};
  let days: number | null = null;
  if (Array.isArray(body?.dates)) {
    const ym = month.slice(0, 7);
    const dates = Array.from(new Set(body.dates.map(String))).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(ym)).sort() as string[];
    days = dates.length;
    update.worked_dates = dates; update.days_override = days;
  } else if (body?.days !== undefined && body?.days !== null) {
    days = Math.round(Number(body.days));
    if (!Number.isFinite(days) || days < 0 || days > 31) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
    update.worked_dates = null; update.days_override = days;
  } else if (body?.auto === true) {
    update.worked_dates = null; update.days_override = null;
  }
  if ("dailyRate" in (body || {})) {
    if (body.dailyRate === null) update.daily_rate_override = null;
    else {
      const r = Math.round(Number(body.dailyRate));
      if (!Number.isFinite(r) || r < 0 || r > 10_000_000) return NextResponse.json({ error: "Valor del dia no valido" }, { status: 400 });
      update.daily_rate_override = r;
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });

  const supabase = createAdminSupabase();
  if (!(await isLedgerEnabled(supabase, tenantId))) {
    return NextResponse.json({ error: "El libro de movimientos no esta activado para este negocio." }, { status: 409 });
  }
  const { data: pro } = await supabase.from("profiles").select("id").eq("id", body.barberId).eq("tenant_id", tenantId).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { error } = await supabase.from("professional_settlements").upsert({
    tenant_id: tenantId, barber_id: body.barberId, month, mode: "rental", ...update,
    updated_by_name: me?.name || null, updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,barber_id,month,mode", ignoreDuplicates: false });
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 091 (version nueva) en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true, days });
}
