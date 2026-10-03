import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, isManagerLevel } from "@/lib/supabase/server";
import { computeProMonths } from "@/lib/ledger";
import { todayInChile } from "@/lib/utils";

// Descuento por planilla: el profesional elige un producto y se genera un CODIGO. Recien cuando
// recepcion o el administrador lo ingresa (ver ./aprobar) se descuenta el stock y se anota en el
// libro del profesional. Aqui: crear el codigo (cualquiera con sesion del negocio, p. ej. la tablet
// de Standby) y ver / rechazar los pendientes (administracion y recepcion).

const LIMIT_PCT = 15;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin letras/numeros que se confunden (0/O, 1/I)
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

export async function POST(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const quantity = Math.floor(Number(body?.quantity) || 1);
  if (!body?.barberId || !body?.productId || quantity < 1 || quantity > 50) {
    return NextResponse.json({ error: "Revisa el producto y la cantidad." }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: pro } = await supabase.from("profiles")
    .select("id, name, work_mode, has_labor_contract").eq("id", body.barberId).eq("tenant_id", tenantId).eq("active", true).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  const { data: prod } = await supabase.from("products")
    .select("id, name, price, stock, product_type").eq("id", body.productId).eq("tenant_id", tenantId).eq("active", true).maybeSingle();
  if (!prod || ((prod as any).product_type || "sale") === "supply") return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (Number(prod.stock) < quantity) return NextResponse.json({ error: `Solo quedan ${prod.stock} en stock.` }, { status: 409 });

  const unit = Math.round(Number(prod.price));
  const total = unit * quantity;

  // Aviso del tope de 15%: solo trabajadores con contrato. Se compara contra lo que lleva ganado el
  // profesional este mes (comision sobre servicios) mas los descuentos ya aprobados del mes.
  let overLimit = false;
  if ((pro as any).has_labor_contract) {
    try {
      const [y, m] = todayInChile().split("-").map(Number);
      const mode = pro.work_mode === "rental" ? "rental" : "commission";
      const months = await computeProMonths(supabase, { tenantId, mode, year: y, month: m });
      const mine = months.find((x) => x.barberId === pro.id);
      const gross = Math.max(0, mine?.base || 0);
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      const { data: done } = await supabase.from("payroll_discounts").select("total")
        .eq("tenant_id", tenantId).eq("barber_id", pro.id).eq("status", "approved").gte("approved_at", first);
      const already = (done || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      overLimit = gross <= 0 ? true : (already + total) > (gross * LIMIT_PCT) / 100;
    } catch {
      overLimit = true; // si no se puede calcular, mejor avisar que dejar pasar sin mirar
    }
  }

  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    const { data, error } = await supabase.from("payroll_discounts").insert({
      tenant_id: tenantId, barber_id: pro.id, barber_name: pro.name, product_id: prod.id, product_name: prod.name,
      quantity, unit_price: unit, total, code, over_limit: overLimit,
    }).select("id, code").single();
    if (!error && data) return NextResponse.json({ success: true, code: data.code, total, overLimit });
    if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: "Falta aplicar la migración 094 en la base de datos." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "No se pudo generar el código. Intenta de nuevo." }, { status: 500 });
}

export async function GET() {
  const { ok, tenantId } = await isManagerLevel();
  if (!ok || !tenantId) return NextResponse.json({ pending: [] });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("payroll_discounts")
    .select("id, barber_name, product_name, quantity, total, over_limit, created_at")
    .eq("tenant_id", tenantId).eq("status", "pending").order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ pending: error ? [] : data || [] });
}

// Rechazar un pendiente.
export async function PATCH(req: NextRequest) {
  const { ok, tenantId, userId } = await isManagerLevel();
  if (!ok || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  if (!body?.id) return NextResponse.json({ error: "Falta el descuento" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: me } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  const { data, error } = await supabase.from("payroll_discounts")
    .update({ status: "rejected", approved_by_name: me?.name || null, approved_at: new Date().toISOString() })
    .eq("id", body.id).eq("tenant_id", tenantId).eq("status", "pending").select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}
