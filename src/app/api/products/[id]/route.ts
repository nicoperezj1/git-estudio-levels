import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminSupabase();
  const body = await req.json();

  // If price is being changed, log it
  if (body.price !== undefined) {
    const { data: current } = await supabase
      .from("products")
      .select("name, price")
      .eq("id", params.id)
      .single();

    if (current && Number(current.price) !== Number(body.price)) {
      await supabase.from("price_history").insert({
        entity_type: "product",
        entity_id: params.id,
        entity_name: current.name,
        old_price: Number(current.price),
        new_price: Number(body.price),
      });
    }
  }

  let { data, error } = await supabase
    .from("products")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  // "Comision por venta" es una columna nueva (migracion 091): si aun no existe, no se pierde el resto de los cambios.
  if (error && /sales_commission/.test(error.message)) {
    const { sales_commission_type: _t, sales_commission_value: _v, ...rest } = body;
    ({ data, error } = await supabase.from("products").update(rest).eq("id", params.id).select().single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
