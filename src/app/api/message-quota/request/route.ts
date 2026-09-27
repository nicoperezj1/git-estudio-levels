import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// "Comprar mas tokens" (Nico, 27-sep): flujo manual — deja la solicitud registrada para
// que el equipo la revise y suba el cupo a mano en Superadmin > Negocios, en vez de cobrar
// automaticamente.
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({}));
  const { channel } = body;

  if (channel !== "whatsapp" && channel !== "email") {
    return NextResponse.json({ error: "Canal invalido" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo identificar el negocio." }, { status: 400 });
  }

  const { userId } = await getCurrentUserRoleAndTenant();
  let requestedBy: string | null = null;
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", userId).single();
    requestedBy = profile?.name || null;
  }

  const { error } = await supabase.from("quota_purchase_requests").insert({
    tenant_id: tenantId,
    channel,
    requested_by: requestedBy,
  });

  if (error) {
    console.error("Error creando solicitud de cupo:", error);
    return NextResponse.json({ error: "No se pudo enviar la solicitud. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
