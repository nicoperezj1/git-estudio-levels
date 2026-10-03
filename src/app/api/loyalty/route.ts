import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isManagerLevel, resolveTenantForRequest } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/lib/plan-features";

// GET: Loyalty overview (config, rewards, client lookup)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const scoped = (q: any) => (tenantId && tenantId !== "ALL" ? q.eq("tenant_id", tenantId) : q);
  const clientId = searchParams.get("clientId");

  // Get config (scoped to the caller's business — each salon has its own program)
  const { data: config } = await scoped(supabase
    .from("loyalty_config")
    .select("*")
    .eq("active", true)).maybeSingle();

  // Get rewards
  const { data: rewards } = await scoped(supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("active", true)
    .order("points_required", { ascending: true }));

  // If clientId, get their points history and balance
  let clientData = null;
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, loyalty_points")
      .eq("id", clientId)
      .single();

    const { data: history } = await supabase
      .from("loyalty_points")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    clientData = { ...client, history: history || [] };
  }

  // Top clients by points
  const { data: topClients } = await scoped(supabase
    .from("clients")
    .select("id, name, loyalty_points")
    .gt("loyalty_points", 0)
    .order("loyalty_points", { ascending: false })
    .limit(10));

  return NextResponse.json({
    config: config || { points_per_clp: 1000 },
    rewards: rewards || [],
    client: clientData,
    topClients: topClients || [],
  });
}

// PUT: el negocio define cuantos CLP hay que gastar para ganar 1 punto (antes fijo en 1.000).
// Solo admin/recepcion, y siempre sobre el negocio de la sesion (nunca el que mande el cuerpo).
export async function PUT(req: NextRequest) {
  const { ok } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }
  if (!(await tenantHasFeature(tenantId, "loyalty"))) {
    return NextResponse.json({ error: "El sistema de fidelizacion no esta incluido en tu plan actual." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const value = Math.round(Number(body?.points_per_clp));
  if (!Number.isFinite(value) || value < 1 || value > 1000000) {
    return NextResponse.json({ error: "Ingresa un monto entre $1 y $1.000.000" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("loyalty_config").select("id").eq("tenant_id", tenantId).eq("active", true).limit(1).maybeSingle();

  const { error } = existing
    ? await supabase.from("loyalty_config").update({ points_per_clp: value }).eq("id", existing.id)
    : await supabase.from("loyalty_config").insert({ points_per_clp: value, active: true, tenant_id: tenantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, points_per_clp: value });
}
