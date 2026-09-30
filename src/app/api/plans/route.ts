import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: Public list of plans for the /suscribirse signup page (no auth — this is
// shown before the business has an account). Only exposes what the pricing UI needs.
export async function GET() {
  const supabase = createAdminSupabase();

  const { data: plans, error } = await supabase
    .from("plan_limits")
    .select(
      "plan, name, price_clp, max_professionals, max_branches, included_professionals, extra_professional_price_clp"
    )
    .neq("plan", "enterprise") // Enterprise no es self-serve (cotiza ventas)
    .order("price_clp", { ascending: true });

  if (error) {
    console.error("[api/plans]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(plans || []);
}
