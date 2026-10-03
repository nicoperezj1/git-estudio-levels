import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";

// Solicitud de insumos (Fase 4). Recepcion o administrador la levantan; le llega por correo al administrador y
// queda en el Dashboard hasta que el administrador la borra a mano (se marca borrada, no se destruye).

export async function GET(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ requests: [] });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("supply_requests")
    .select("id, created_by_name, items, notes, email_sent, email_to, created_at")
    .eq("tenant_id", tenantId).eq("status", "open").order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ requests: error ? [] : data || [] });
}

export async function POST(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { tenantId, denied } = await resolveTenantForRequest(body?.tenantId);
  if (denied || !tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const supabase = createAdminSupabase();

  // Items: los productos del inventario traen sus existencias desde la base (no se confia en el navegador).
  const raw: any[] = Array.isArray(body?.items) ? body.items.slice(0, 200) : [];
  const ids = raw.map((i) => i?.productId).filter(Boolean);
  const stockById = new Map<string, { name: string; stock: number }>();
  if (ids.length > 0) {
    const { data } = await supabase.from("products").select("id, name, stock").eq("tenant_id", tenantId).in("id", ids);
    for (const p of data || []) stockById.set(p.id, { name: p.name, stock: Number(p.stock) });
  }
  const items: Array<{ product_id: string | null; name: string; current_stock: number | null; to_buy: number }> = [];
  for (const i of raw) {
    const toBuy = Math.round(Number(i?.toBuy));
    if (!Number.isFinite(toBuy) || toBuy <= 0 || toBuy > 100000) continue;
    if (i?.productId) {
      const p = stockById.get(i.productId);
      if (p) items.push({ product_id: i.productId, name: p.name, current_stock: p.stock, to_buy: toBuy });
    } else {
      const name = String(i?.name || "").trim().slice(0, 80);
      if (!name) continue;
      const cur = Number(i?.currentStock);
      items.push({ product_id: null, name, current_stock: Number.isFinite(cur) && cur >= 0 ? Math.round(cur) : null, to_buy: toBuy });
    }
  }
  if (items.length === 0) return NextResponse.json({ error: "Indica la cantidad a solicitar de al menos un producto." }, { status: 400 });

  const notes = String(body?.notes || "").trim().slice(0, 300) || null;
  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { data: tenant } = await supabase.from("tenants").select("name, admin_email, supply_request_email").eq("id", tenantId).maybeSingle();
  const emailTo = (tenant as any)?.supply_request_email || tenant?.admin_email || null;

  const { data: row, error } = await supabase.from("supply_requests").insert({
    tenant_id: tenantId, created_by: caller.userId, created_by_name: me?.name || null, items, notes, email_to: emailTo,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 092 en la base de datos." }, { status: 409 });

  // El correo no debe hacer fallar la solicitud: si no sale, igual queda en el Dashboard.
  let emailSent = false;
  if (emailTo) {
    try {
      const { sendSupplyRequestEmail } = await import("@/lib/resend");
      const r = await sendSupplyRequestEmail({
        to: emailTo, businessName: tenant?.name || "tu negocio", requestedBy: me?.name || "Recepción", date: new Date(), notes,
        items: items.map((i) => ({ name: i.name, currentStock: i.current_stock, toBuy: i.to_buy, isOther: !i.product_id })),
      });
      emailSent = !!r.success;
      if (emailSent) await supabase.from("supply_requests").update({ email_sent: true }).eq("id", row.id);
    } catch (e) {
      console.error("supply request email:", e);
    }
  }
  return NextResponse.json({ success: true, id: row.id, emailSent });
}

export async function DELETE(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  if (caller.role !== "admin" && caller.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const id = searchParams.get("id");
  if (!tenantId || tenantId === "ALL" || !id) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: me } = await supabase.from("profiles").select("name").eq("id", caller.userId).maybeSingle();
  const { data, error } = await supabase.from("supply_requests")
    .update({ status: "deleted", deleted_by_name: me?.name || null, deleted_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", tenantId).eq("status", "open").select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  return NextResponse.json({ success: true });
}
