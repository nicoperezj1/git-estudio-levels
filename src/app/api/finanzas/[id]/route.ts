import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { accountingColumnsAvailable, monthStart } from "@/lib/accounting";

// Punto 5 (Pablo): editar/eliminar movimientos manuales, disponible solo para el
// administrador (pueden existir errores de digitacion o movimientos mal ingresados).
// Gate en el servidor, no solo en la UI: ocultar el menu en la pagina no alcanza si
// cualquier usuario autenticado pudiera llamar a este endpoint directamente.
async function requireAdmin() {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

const ASSIGNED_TO_VALUES = new Set(["professional", "reception", "business"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = createAdminSupabase();
  const body = await req.json();
  const { description, amount, paymentMethod, notes, assignedTo, barberId, accountingMonth } = body;

  const updates: Record<string, any> = {};
  if (amount !== undefined) {
    updates.subtotal = amount;
    updates.total = amount;
  }
  if (paymentMethod !== undefined) updates.payment_method = String(paymentMethod).toLowerCase();
  if (notes !== undefined) updates.notes = notes;
  if (assignedTo !== undefined) {
    updates.assigned_to = ASSIGNED_TO_VALUES.has(assignedTo) ? assignedTo : null;
    // Clear the linked professional whenever the category stops being "professional",
    // so a movement re-tagged as Recepcion/Negocio general doesn't keep pointing at a
    // barber that no longer applies.
    updates.barber_id = updates.assigned_to === "professional" && barberId ? barberId : null;
  }

  // "Corresponde al mes": solo si la columna existe (migracion 090) y el mes es valido.
  if (accountingMonth !== undefined && (await accountingColumnsAvailable(supabase))) {
    const m = monthStart(accountingMonth);
    if (m) updates.accounting_month = m;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("transactions").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (description !== undefined) {
    // The item description is the single source of truth the Finanzas table displays.
    // Manual transactions are created with exactly one transaction_items row (see
    // POST above), so updating that row (rather than inserting another) keeps it that
    // way instead of accumulating duplicate line items on every edit.
    const { data: items } = await supabase
      .from("transaction_items")
      .select("id")
      .eq("transaction_id", params.id)
      .limit(1);
    if (items && items.length > 0) {
      await supabase
        .from("transaction_items")
        .update({ description, unit_price: amount, total: amount })
        .eq("id", items[0].id);
    }
  }

  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select(`*, client:clients(name), barber:profiles(name), items:transaction_items(description, total)`)
    .eq("id", params.id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  return NextResponse.json(tx);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = createAdminSupabase();

  // Soft delete: reuse the existing "cancelled" transaction_status instead of removing
  // the row. Every read in Finanzas/Dashboard/reportes already filters
  // .eq("status", "completed"), so this makes the movement disappear everywhere
  // immediately while keeping it in the database for audit/undo — consistent with
  // "nunca elimines nada" for anything that can be reversed instead of destroyed.
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cancelled" })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
