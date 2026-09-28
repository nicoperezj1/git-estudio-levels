import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";

// PATCH: Update onboarding progress (item 37, Nico 27-sep). Called by the wizard as the
// admin moves between steps, so closing the tab mid-flow resumes at the right step instead
// of restarting from "Bienvenida", and marks it fully done at the end so the redirect in
// /dashboard stops firing.
export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({}));
  const { step, completed } = body;

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof step === "number") updates.onboarding_step = step;
  if (typeof completed === "boolean") updates.onboarding_completed = completed;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { error } = await supabase.from("tenants").update(updates).eq("id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
