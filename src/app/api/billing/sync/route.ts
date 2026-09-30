import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { mpGet } from "@/lib/mercadopago";
import { handlePreapprovalUpdate } from "@/lib/subscription-webhook";

// POST { preapproval_id }: al volver de Mercado Pago tras reactivar, confirma la suscripcion
// consultando a MP (no se confia en el cliente) y, si esta "authorized" y pertenece a este
// negocio, aplica la reactivacion. Respaldo por si el aviso (webhook) no llego.
export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const preapprovalId = String(body.preapproval_id || "");
  if (!/^[0-9a-zA-Z]+$/.test(preapprovalId)) return NextResponse.json({ error: "preapproval_id inválido" }, { status: 400 });

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "Mercado Pago no configurado" }, { status: 500 });

  const preapproval = await mpGet(`/preapproval/${preapprovalId}`, accessToken);
  const ref: string = preapproval?.external_reference || "";
  if (!ref.startsWith("reactivate:")) return NextResponse.json({ error: "No corresponde a una reactivación" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: sub } = await supabase.from("subscriptions").select("tenant_id").eq("id", ref.slice("reactivate:".length)).single();
  if (!sub || sub.tenant_id !== tenantId) return NextResponse.json({ error: "No corresponde a este negocio" }, { status: 403 });

  await handlePreapprovalUpdate(preapprovalId, accessToken, supabase);
  return NextResponse.json({ ok: true, status: preapproval.status });
}
