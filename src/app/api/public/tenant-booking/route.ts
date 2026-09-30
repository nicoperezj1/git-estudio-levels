import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: Get tenant info + barbers for public booking page
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  // Find tenant by slug
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, logo_url, phone, address, active, status")
    .eq("slug", slug)
    .eq("active", true)
    .single();

  if (!tenant) {
    // Also check branches (for multi-branch within same tenant)
    const { data: branch } = await supabase
      .from("branches")
      .select("id, name, slug, phone, address, tenant_id")
      .eq("slug", slug)
      .eq("active", true)
      .single();

    if (!branch) {
      return NextResponse.json({ tenant: null, error: "not_found" });
    }

    // Get barbers for this branch
    const { data: barbers } = await supabase
      .from("profiles")
      .select("id, name, avatar_url, bio, specialties")
      .eq("role", "barber")
      .eq("active", true)
      .eq("branch_id", branch.id);

    return NextResponse.json({
      tenant: { id: branch.tenant_id, name: branch.name, slug: branch.slug, logo_url: null, phone: branch.phone, address: branch.address },
      barbers: barbers || [],
    });
  }

  if (tenant.status === "suspended") {
    return NextResponse.json({ tenant: null, error: "suspended" });
  }

  // Get barbers for this tenant
  const { data: barbers } = await supabase
    .from("profiles")
    .select("id, name, avatar_url, bio, specialties")
    .eq("role", "barber")
    .eq("active", true)
    .eq("tenant_id", tenant.id);

  return NextResponse.json({ tenant, barbers: barbers || [] });
}
