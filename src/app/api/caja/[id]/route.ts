import { NextRequest, NextResponse } from "next/server";
import { pinOr } from "@/lib/pin";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Punto (Nico, 25-sep): modificar/eliminar un movimiento desde Caja (misma tabla
// `transactions` que Finanzas). Regla de negocio pedida por Pablo: desde una sesion de
// Recepcion se exige el PIN de un Administrador (verificado ACA, en el servidor, no solo
// en el modal del frontend); desde una sesion de Administrador no se pide PIN, pero el
// frontend exige una doble confirmacion antes de llamar a esta ruta.
//
// SEGURIDAD: a diferencia de /api/finanzas/[id] (que solo valida el rol, sin acotar el
// movimiento al tenant del que llama), esta ruta SI verifica que el movimiento pertenezca
// al negocio del usuario antes de tocarlo — mismo patron ya corregido en ~21 rutas.
async function authorize(pin?: string) {
  const { role, tenantId } = await getCurrentUserRoleAndTenant();

  if (role !== "admin" && role !== "super_admin" && role !== "receptionist") {
    return { denied: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const;
  }

  if (role === "receptionist") {
    if (!pin || pin.length !== 4) {
      return { denied: NextResponse.json({ error: "PIN de administrador requerido" }, { status: 401 }) } as const;
    }
    const supabase = createAdminSupabase();
    const { data: admin } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .or(await pinOr(supabase, pin))
      .eq("active", true)
      .eq("tenant_id", tenantId)
      .single();
    if (!admin) {
      return { denied: NextResponse.json({ error: "PIN incorrecto" }, { status: 401 }) } as const;
    }
  }

  return { denied: null, role, tenantId } as const;
}

// Confirms the transaction exists and belongs to the caller's business (super_admin is
// not restricted — same convention as resolveTenantForRequest elsewhere).
async function loadOwnedTransaction(id: string, role: string | null, tenantId: string | null) {
  const supabase = createAdminSupabase();
  const { data } = await supabase.from("transactions").select("id, tenant_id").eq("id", id).single();
  if (!data) return { error: NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 }) };
  if (role !== "super_admin" && data.tenant_id !== tenantId) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  return { error: null };
}

const PAYMENT_METHODS = new Set(["cash", "debit_card", "credit_card", "transfer"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({} as any));
  const auth = await authorize(body.pin);
  if (auth.denied) return auth.denied;

  const owned = await loadOwnedTransaction(params.id, auth.role, auth.tenantId);
  if (owned.error) return owned.error;

  const supabase = createAdminSupabase();
  const { barberId, serviceName, amount, paymentMethod, tip, notes } = body;

  const updates: Record<string, any> = {};
  if (amount !== undefined && amount !== "") {
    updates.subtotal = amount;
    updates.total = amount;
  }
  if (paymentMethod !== undefined && PAYMENT_METHODS.has(paymentMethod)) {
    updates.payment_method = paymentMethod;
  }
  if (tip !== undefined) updates.tip_amount = tip === "" ? 0 : tip;
  if (notes !== undefined) updates.notes = notes || null;
  if (barberId !== undefined) updates.barber_id = barberId || null;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("transactions").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Caja muestra el servicio a partir de la(s) fila(s) de transaction_items. Igual que en
  // Finanzas, los movimientos que se editan aca tienen una sola linea, asi que se
  // actualiza esa fila en vez de insertar otra (evita acumular lineas duplicadas).
  if (serviceName !== undefined || (amount !== undefined && amount !== "")) {
    const { data: items } = await supabase
      .from("transaction_items")
      .select("id")
      .eq("transaction_id", params.id)
      .limit(1);
    if (items && items.length > 0) {
      const itemUpdates: Record<string, any> = {};
      if (serviceName !== undefined) itemUpdates.description = serviceName;
      if (amount !== undefined && amount !== "") {
        itemUpdates.unit_price = amount;
        itemUpdates.total = amount;
      }
      await supabase.from("transaction_items").update(itemUpdates).eq("id", items[0].id);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({} as any));
  const auth = await authorize(body.pin);
  if (auth.denied) return auth.denied;

  const owned = await loadOwnedTransaction(params.id, auth.role, auth.tenantId);
  if (owned.error) return owned.error;

  const supabase = createAdminSupabase();

  // Soft delete (misma convencion que /api/finanzas/[id]): reusa el status "cancelled" en
  // vez de borrar la fila. La consulta GET de Caja ya filtra .eq("status","completed"), asi
  // que el movimiento desaparece de inmediato mientras se conserva para auditoria.
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cancelled" })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
