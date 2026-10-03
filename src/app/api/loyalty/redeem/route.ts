import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/lib/plan-features";

// POST: Client redeems points for a reward
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion (permitia fabricar cupones para cualquier cliente).
  const caller = await isManagerLevel();
  if (!caller.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminSupabase();
  const body = await req.json();
  const { clientId, rewardId } = body;

  if (!clientId || !rewardId) {
    return NextResponse.json({ error: "clientId y rewardId requeridos" }, { status: 400 });
  }

  // Get client balance (also read tenant_id, needed to tag the coupon this creates below)
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, loyalty_points, tenant_id")
    .eq("id", clientId)
    .single();

  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  // El cliente tiene que ser del negocio de quien canjea (salvo super_admin).
  if (caller.role !== "super_admin" && (client as any).tenant_id !== caller.tenantId) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Item 34: "Sistema de fidelizacion" es feature de plan (Pro+).
  if (!(await tenantHasFeature((client as any).tenant_id, "loyalty"))) {
    return NextResponse.json({ error: "El sistema de fidelizacion no esta incluido en tu plan actual." }, { status: 403 });
  }

  // Get reward
  const { data: reward } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("id", rewardId)
    .eq("active", true)
    .single();

  if (!reward) return NextResponse.json({ error: "Recompensa no encontrada" }, { status: 404 });
  // La recompensa tiene que ser del mismo negocio que el cliente (las antiguas sin negocio se aceptan).
  if (reward.tenant_id && reward.tenant_id !== (client as any).tenant_id) {
    return NextResponse.json({ error: "Recompensa no encontrada" }, { status: 404 });
  }

  // Check sufficient points
  if (client.loyalty_points < reward.points_required) {
    return NextResponse.json({
      error: `Puntos insuficientes. Necesitas ${reward.points_required}, tienes ${client.loyalty_points}`,
    }, { status: 400 });
  }

  // Deduct points
  await supabase.from("loyalty_points").insert({
    client_id: clientId,
    points: -reward.points_required,
    reason: "redeem",
    reward_id: rewardId,
  });

  // Update cached balance
  const newBalance = client.loyalty_points - reward.points_required;
  await supabase
    .from("clients")
    .update({ loyalty_points: newBalance })
    .eq("id", clientId);

  // Create a coupon for the client to use (tagged with the client's business, otherwise
  // it's invisible in that salon's coupon list — same orphan-row class of bug as products).
  const couponCode = `FIDELIDAD-${client.name.split(" ")[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  await supabase.from("coupons").insert({
    code: couponCode,
    description: `Canje fidelidad: ${reward.name}`,
    discount_type: "fixed_amount",
    discount_value: reward.discount_value || 0,
    max_uses: 1,
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    tenant_id: (client as any).tenant_id || null,
  });

  return NextResponse.json({
    success: true,
    newBalance,
    couponCode,
    reward: reward.name,
  });
}
