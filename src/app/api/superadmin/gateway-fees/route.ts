import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Guarda la comision (%) de una pasarela. Solo super_admin. fee_pct null/"" = sin configurar.
export async function PATCH(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const gateway = String(body.gateway || "").trim();
  if (!gateway) return NextResponse.json({ error: "Falta la pasarela" }, { status: 400 });

  let feePct: number | null = null;
  if (body.fee_pct !== null && body.fee_pct !== "" && body.fee_pct !== undefined) {
    feePct = Number(String(body.fee_pct).replace(",", "."));
    if (!Number.isFinite(feePct) || feePct < 0 || feePct > 100) {
      return NextResponse.json({ error: "La comisión debe estar entre 0 y 100" }, { status: 400 });
    }
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("gateway_fees")
    .update({ fee_pct: feePct, updated_at: new Date().toISOString() })
    .eq("gateway", gateway);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
