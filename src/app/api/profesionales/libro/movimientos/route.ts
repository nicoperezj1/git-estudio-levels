import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { LEDGER_KINDS, isLedgerEnabled, type LedgerKind } from "@/lib/ledger";
import { monthStart } from "@/lib/accounting";

// "Agregar movimiento" al libro de un profesional (solo administrador). Cada movimiento guarda quien lo
// hizo y el motivo; no se borra: se ANULA (queda en la base).

async function admin() {
  const c = await getCurrentUserRoleAndTenant();
  if (c.role !== "admin" && c.role !== "super_admin") return null;
  return c;
}

export async function POST(req: NextRequest) {
  const caller = await admin();
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { tenantId, denied } = await resolveTenantForRequest(body?.tenantId);
  if (denied || !tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const supabase = createAdminSupabase();
  if (!(await isLedgerEnabled(supabase, tenantId))) {
    return NextResponse.json({ error: "El libro de movimientos no esta activado para este negocio." }, { status: 409 });
  }

  const kind = body?.kind as LedgerKind;
  const month = monthStart(`${body?.year}-${String(body?.month).padStart(2, "0")}`);
  const amount = Math.round(Number(body?.amount));
  const reason = String(body?.reason || "").trim();
  if (!(kind in LEDGER_KINDS) || !month || !Number.isFinite(amount) || amount <= 0 || !body?.barberId) {
    return NextResponse.json({ error: "Revisa el tipo, el monto y el profesional." }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Escribe el motivo del movimiento." }, { status: 400 });
  // Solo el movimiento manual deja elegir el signo; el resto sigue la regla de su tipo.
  const effect: 1 | -1 = kind === "manual" ? (Number(body?.effect) === -1 ? -1 : 1) : LEDGER_KINDS[kind].effect;

  // El profesional debe ser de este negocio.
  const { data: pro } = await supabase.from("profiles").select("id").eq("id", body.barberId).eq("tenant_id", tenantId).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { data, error } = await supabase.from("professional_ledger").insert({
    tenant_id: tenantId, barber_id: body.barberId, month, kind, amount, effect, reason,
    created_by: caller.userId, created_by_name: me?.name || null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 091 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true, id: data.id });
}

// Anular un movimiento del libro.
export async function DELETE(req: NextRequest) {
  const caller = await admin();
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const id = searchParams.get("id");
  if (denied || !tenantId || tenantId === "ALL" || !id) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { data, error } = await supabase.from("professional_ledger")
    .update({ status: "cancelled", cancelled_by_name: me?.name || null, cancelled_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", tenantId).eq("status", "active").select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}
