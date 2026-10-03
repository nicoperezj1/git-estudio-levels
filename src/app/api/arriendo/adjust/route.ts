import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifyAdminPin, barberInTenant } from "@/lib/admin-pin";

// POST: Apply a manual rental adjustment (bonus or deduction) directly on the
// professional's rental_records row for that month, with PIN verification.
//
// This exists because the old flow (Arriendo's "Ajuste Manual" button) called
// /api/comisiones/adjust, which writes to the transactions table for the Comisiones
// module — Arriendo never reads that table, so the adjustment was "confirmed" by the
// system but never showed up on the professional's rental card. This endpoint writes
// to the table Arriendo actually reads (rental_records), so the change is visible
// immediately.
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { barberId, month, year, amount, type, reason, pin } = await req.json();

  if (!barberId || !month || !year || !amount || !reason || !pin) {
    return NextResponse.json({ error: "barberId, month, year, amount, reason y pin son obligatorios" }, { status: 400 });
  }

  // SEGURIDAD: sesion + PIN de un administrador del MISMO negocio, y el profesional debe ser de ese negocio.
  const auth = await verifyAdminPin(pin);
  if (!auth.ok) return auth.response;
  const admin = auth.admin;
  if (!(await barberInTenant(barberId, auth.role, auth.tenantId))) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("rental_daily_rate, tenant_id")
    .eq("id", barberId)
    .single();

  if (!prof) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  const dailyRate = Number(prof.rental_daily_rate) || 29000;
  const signedAmount = type === "deduction" ? -Math.abs(amount) : Math.abs(amount);

  // Get (or start from scratch) this month's record so the adjustment adds/subtracts
  // on top of whatever is already there, instead of overwriting it.
  const { data: existing } = await supabase
    .from("rental_records")
    .select("*")
    .eq("barber_id", barberId)
    .eq("month", month)
    .eq("year", year)
    .single();

  const daysWorked = existing?.days_worked ?? 0;
  const grossAmount = existing?.gross_amount ?? (daysWorked * dailyRate);
  // A "bono" (addition) increases product_bonus; a "descuento" (deduction) increases
  // deductions. Both are tracked as positive numbers in their own column, matching how
  // the rest of the app (and the "Ajustar" panel) already treats these two fields.
  const newDeductions = type === "deduction" ? (Number(existing?.deductions) || 0) + Math.abs(amount) : (Number(existing?.deductions) || 0);
  const newProductBonus = type === "addition" ? (Number(existing?.product_bonus) || 0) + Math.abs(amount) : (Number(existing?.product_bonus) || 0);
  const netAmount = grossAmount - newDeductions + newProductBonus;

  const noteEntry = `[AJUSTE ${type === "deduction" ? "-" : "+"}$${Math.abs(amount).toLocaleString("es-CL")}] ${reason} — por ${admin.name}`;
  const combinedNotes = existing?.notes ? `${existing.notes}\n${noteEntry}` : noteEntry;

  const { data: record, error } = await supabase
    .from("rental_records")
    .upsert({
      barber_id: barberId,
      month,
      year,
      days_worked: daysWorked,
      daily_rate: dailyRate,
      gross_amount: grossAmount,
      deductions: newDeductions,
      product_bonus: newProductBonus,
      net_amount: netAmount,
      notes: combinedNotes,
      tenant_id: prof.tenant_id || null,
    }, { onConflict: "barber_id,month,year" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log in audit (same pattern as commissions/adjust)
  await supabase.from("audit_log").insert({
    action: "rental_adjustment",
    entity_type: "rental_record",
    entity_id: record.id,
    description: `Ajuste de arriendo: ${type === "deduction" ? "-" : "+"}$${Math.abs(amount).toLocaleString("es-CL")} — ${reason}`,
    user_id: admin.id,
    user_name: admin.name,
    reversible: true,
    metadata: { barberId, amount, type, reason, month, year },
  });

  return NextResponse.json({ success: true, record, adjustedBy: admin.name });
}
