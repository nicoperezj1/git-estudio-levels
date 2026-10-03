import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// Public services list, ALWAYS scoped to one business. Without a tenant it returns an
// empty list instead of every salon's services mixed together (cross-business leak).
// Accepts ?tenant=<slug> or ?branch=<slug> (hyphen-insensitive, like the rest).
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const branchSlug = searchParams.get("tenant") || searchParams.get("branch");

  if (!branchSlug) {
    return NextResponse.json([]);
  }

  const norm = (s: string) => s.replace(/-/g, "").toLowerCase();
  const { data: allTenants } = await supabase.from("tenants").select("id, slug").eq("active", true);
  const tenant = (allTenants || []).find((t) => norm(t.slug) === norm(branchSlug));

  if (!tenant) {
    return NextResponse.json([]);
  }

  const { data } = await supabase
    .from("services")
    .select("id, name, description, price, duration, sort_order")
    .eq("active", true)
    .eq("tenant_id", tenant.id)
    // Mismo orden que el admin definio arrastrando en Servicios (sort_order); el precio solo
    // desempata entre servicios que aun no tienen un orden propio.
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  return NextResponse.json(data || []);
}
