import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/lib/plan-features";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const status = searchParams.get("status"); // pending, approved, all

  let query = supabase
    .from("inventory_movements")
    .select(`
      *,
      product:products(name),
      barber:profiles!barber_id(name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (tenantId && tenantId !== "ALL") query = query.eq("tenant_id", tenantId);
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json([]);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { productId, type, quantity, notes, barberId, requireApproval, tenantId: bodyTenantId } = body;

  // Resolve tenant from the product itself (a movement always belongs to the product's
  // business), falling back to the explicit param / session.
  let tenantId: string | null = bodyTenantId || null;
  if (!tenantId && productId) {
    const { data: prod } = await supabase.from("products").select("tenant_id").eq("id", productId).single();
    tenantId = prod?.tenant_id || null;
  }
  if (!tenantId) {
    const { searchParams } = new URL(req.url);
    const { tenantId: resolved } = await resolveTenantForRequest(searchParams.get("tenantId"));
    tenantId = resolved && resolved !== "ALL" ? resolved : null;
  }

  // Item 34: "Inventario" (control de stock/movimientos) es feature de plan (Pro+). No se
  // gatea la venta de productos en si (POS), solo el registro de movimientos de stock.
  if (!(await tenantHasFeature(tenantId, "inventory"))) {
    return NextResponse.json({ error: "El control de inventario no esta incluido en tu plan actual. Mejora tu plan para usarlo." }, { status: 403 });
  }

  const needsApproval = requireApproval !== false && type !== "out_sale";

  // Create movement (pending or approved)
  const { data: movement, error } = await supabase
    .from("inventory_movements")
    .insert({
      product_id: productId,
      type,
      quantity,
      notes,
      barber_id: barberId || null,
      status: needsApproval ? "pending" : "approved",
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only update stock if approved immediately
  if (!needsApproval) {
    await updateStock(supabase, productId, type, quantity);
  }

  return NextResponse.json({ ...movement, needsApproval }, { status: 201 });
}

// PATCH: Approve or reject a pending movement
export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { movementId, action, adminPin } = body; // action: 'approve' | 'reject'

  // Simple PIN validation (configurable)
  const ADMIN_PIN = process.env.ADMIN_PIN || "1234";
  if (adminPin && adminPin !== ADMIN_PIN) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 403 });
  }

  const { data: movement } = await supabase
    .from("inventory_movements")
    .select("*")
    .eq("id", movementId)
    .eq("status", "pending")
    .single();

  if (!movement) {
    return NextResponse.json({ error: "Movimiento no encontrado o ya procesado" }, { status: 404 });
  }

  if (action === "approve") {
    await supabase
      .from("inventory_movements")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", movementId);

    // Update stock
    await updateStock(supabase, movement.product_id, movement.type, movement.quantity);

    return NextResponse.json({ success: true, action: "approved" });
  } else {
    await supabase
      .from("inventory_movements")
      .update({ status: "rejected" })
      .eq("id", movementId);

    return NextResponse.json({ success: true, action: "rejected" });
  }
}

async function updateStock(supabase: any, productId: string, type: string, quantity: number) {
  const { data: product } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();

  if (product) {
    let newStock = product.stock;
    if (type === "in") newStock += quantity;
    else if (type === "out_use" || type === "out_sale") newStock -= quantity;
    else if (type === "adjustment") newStock = quantity;

    await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", productId);
  }
}
