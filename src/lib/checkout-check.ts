// Verificacion (solo lectura) de los totales de una venta del POS.
// MODO COMPARACION: el servidor recalcula lo que el navegador mando y, si algo no cuadra, lo deja anotado
// en el registro de auditoria. NO cambia ni rechaza la venta: primero se mira durante unos dias que pasa en
// la vida real (precios editados a mano, cupones, puntos) y recien despues se decide si se activa el bloqueo.

export interface CheckItem { type?: string; id?: string; name?: string; price?: number; quantity?: number }
export interface CheckPayment { method?: string; amount?: number }
export interface CheckInput {
  items: CheckItem[];
  subtotal: number;
  discount?: number;
  total: number;
  payments?: CheckPayment[];
  redeemedPoints?: number;
}
export interface CheckIssue { code: string; level: "warn" | "info"; detail: string }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

// Reglas que no necesitan la base de datos.
export function checkTotalsPure(inp: CheckInput): CheckIssue[] {
  const out: CheckIssue[] = [];
  const items = Array.isArray(inp.items) ? inp.items : [];
  let itemsSum = 0;
  items.forEach((it, i) => {
    const price = num(it.price), qty = num(it.quantity);
    if (!(price >= 0) || !(qty >= 1) || !Number.isInteger(qty)) {
      out.push({ code: "invalid_item", level: "warn", detail: `Ítem ${i + 1} (${it.name || it.id || "?"}): precio=${it.price} cantidad=${it.quantity}` });
    } else {
      itemsSum += price * qty;
    }
  });
  const subtotal = num(inp.subtotal), total = num(inp.total), discount = num(inp.discount ?? 0);
  if (subtotal !== itemsSum) out.push({ code: "subtotal_mismatch", level: "warn", detail: `Subtotal enviado ${inp.subtotal}, suma de ítems ${itemsSum}` });
  if (!(discount >= 0) || discount > itemsSum) out.push({ code: "discount_out_of_range", level: "warn", detail: `Descuento ${inp.discount} con subtotal ${itemsSum}` });
  if (total !== subtotal - (Number.isFinite(discount) ? discount : 0)) out.push({ code: "total_mismatch", level: "warn", detail: `Total enviado ${inp.total}, subtotal − descuento = ${subtotal - (Number.isFinite(discount) ? discount : 0)}` });
  if (inp.payments && inp.payments.length > 0) {
    const paid = inp.payments.reduce((s, p) => s + (num(p.amount) || 0), 0);
    if (paid !== total) out.push({ code: "payments_mismatch", level: "warn", detail: `Pagos suman ${paid}, total ${inp.total}` });
  }
  const rp = num(inp.redeemedPoints ?? 0);
  if (rp > 0 && rp * 100 > (Number.isFinite(discount) ? discount : 0)) {
    out.push({ code: "points_exceed_discount", level: "warn", detail: `${rp} puntos canjeados (${rp * 100}) y descuento ${inp.discount}` });
  }
  return out;
}

// Compara con el catalogo del negocio. Un precio distinto es "info" (el cajero puede editar el precio a mano);
// un ítem que no existe o es de otro negocio es "warn".
export async function checkAgainstCatalog(supabase: any, tenantId: string | null, barberId: string, items: CheckItem[]): Promise<CheckIssue[]> {
  const out: CheckIssue[] = [];
  const svcIds = items.filter((i) => i.type === "service" && i.id).map((i) => i.id as string);
  const prodIds = items.filter((i) => i.type === "product" && i.id).map((i) => i.id as string);

  const [svcRes, customRes, prodRes] = await Promise.all([
    svcIds.length ? supabase.from("services").select("id, name, price, tenant_id").in("id", svcIds) : Promise.resolve({ data: [] }),
    svcIds.length ? supabase.from("barber_services").select("service_id, custom_price").eq("barber_id", barberId).in("service_id", svcIds) : Promise.resolve({ data: [] }),
    prodIds.length ? supabase.from("products").select("id, name, price, tenant_id").in("id", prodIds) : Promise.resolve({ data: [] }),
  ]);
  const svc = new Map<string, any>((svcRes.data || []).map((s: any) => [s.id, s]));
  const custom = new Map<string, any>((customRes.data || []).map((c: any) => [c.service_id, c]));
  const prod = new Map<string, any>((prodRes.data || []).map((p: any) => [p.id, p]));

  for (const it of items) {
    if ((it.type !== "service" && it.type !== "product") || !it.id) continue;
    const row = it.type === "service" ? svc.get(it.id) : prod.get(it.id);
    if (!row || (tenantId && row.tenant_id && row.tenant_id !== tenantId)) {
      out.push({ code: "item_not_in_tenant", level: "warn", detail: `${it.type} ${it.id} (${it.name || "?"}) no existe o es de otro negocio` });
      continue;
    }
    let expected = Number(row.price);
    if (it.type === "service") {
      const c = custom.get(it.id);
      if (c && c.custom_price != null) expected = Number(c.custom_price);
    }
    if (Number(it.price) !== expected) {
      out.push({ code: "price_edited", level: "info", detail: `${it.name || it.id}: cobrado ${it.price}, catálogo ${expected}` });
    }
  }
  return out;
}
