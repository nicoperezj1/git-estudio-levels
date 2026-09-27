import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// POST: Verify an invite code and link user to tenant
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { code, userId } = await req.json();

  if (!code) {
    return NextResponse.json({ error: "Codigo requerido" }, { status: 400 });
  }

  // Find valid code
  const { data: invite } = await supabase
    .from("invite_codes")
    .select("id, tenant_id, uses_remaining, expires_at, active")
    .eq("code", code.toUpperCase().trim())
    .eq("active", true)
    .single();

  if (!invite) {
    return NextResponse.json({ error: "Codigo invalido o expirado" }, { status: 404 });
  }

  // Check expiration
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Codigo expirado" }, { status: 410 });
  }

  // Check uses remaining
  if (invite.uses_remaining <= 0) {
    return NextResponse.json({ error: "Codigo agotado (sin usos restantes)" }, { status: 410 });
  }

  // Get tenant name
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", invite.tenant_id)
    .single();

  // If userId provided, link user to tenant
  if (userId) {
    // Bug (reportado por Nico, 27-sep): mismo problema que en POST /api/barberos — esto
    // unia al usuario como "barber" sin validar tenants.max_professionals, permitiendo
    // eludir el limite del plan por esta via (codigo de invitacion) aunque el alta manual
    // desde el panel ya estuviera bloqueada.
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("max_professionals")
      .eq("id", invite.tenant_id)
      .single();

    if (tenantRow && typeof tenantRow.max_professionals === "number") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", invite.tenant_id)
        .eq("role", "barber")
        .eq("active", true);

      if ((count || 0) >= tenantRow.max_professionals) {
        return NextResponse.json(
          { error: "Ups, este negocio ya alcanzó la cantidad máxima de profesionales permitida por su plan." },
          { status: 403 }
        );
      }
    }

    await supabase
      .from("profiles")
      .update({ tenant_id: invite.tenant_id, role: "barber" })
      .eq("id", userId);

    // Decrement uses
    await supabase
      .from("invite_codes")
      .update({ uses_remaining: invite.uses_remaining - 1 })
      .eq("id", invite.id);
  }

  return NextResponse.json({
    success: true,
    tenantId: invite.tenant_id,
    tenantName: tenant?.name || "Negocio",
  });
}
