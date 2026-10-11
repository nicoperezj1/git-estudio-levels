import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: Public list of plans for the /suscribirse signup page (no auth — this is
// shown before the business has an account). Only exposes what the pricing UI needs.
export async function GET() {
  const supabase = createAdminSupabase();

  const { data: plans, error } = await supabase
    .from("plan_limits")
    .select("*") // seat_prices (migracion 109) solo existe si ya se aplico
    .neq("plan", "enterprise") // Enterprise no es self-serve (cotiza ventas)
    .order("price_clp", { ascending: true });

  if (error) {
    console.error("[api/plans]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Solo lo que necesita la pantalla de precios.
  return NextResponse.json(
    (plans || []).map((p: any) => ({
      plan: p.plan, name: p.name, price_clp: p.price_clp, max_professionals: p.max_professionals, max_branches: p.max_branches,
      included_professionals: p.included_professionals, extra_professional_price_clp: p.extra_professional_price_clp,
      seat_prices: p.seat_prices ?? null,
    }))
  );
}
