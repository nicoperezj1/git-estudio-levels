import { NextRequest, NextResponse } from "next/server";
import { isManagerLevel } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

/**
 * POST: enviar un aviso push desde el navegador (por ejemplo "mensaje del admin al equipo").
 * SEGURIDAD: antes no pedia sesion, asi que cualquiera podia mandar avisos al equipo de cualquier negocio.
 * Ahora exige sesion de administrador/recepcion y solo llega a personas del mismo negocio
 * (el super_admin puede enviar a cualquiera). Las rutas del servidor (reserva, cita, cliente llego,
 * deposito) NO pasan por aqui: llaman a sendPush() de src/lib/push.ts directamente.
 * Body: { userId?, userIds?, roles?, title, body?, icon?, url? }  (el negocio sale de la sesion)
 */
export async function POST(req: NextRequest) {
  const { ok, role, tenantId } = await isManagerLevel();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (role !== "super_admin" && !tenantId) return NextResponse.json({ error: "No se pudo identificar el negocio" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  if (!b?.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const result = await sendPush({
    userId: b.userId,
    userIds: Array.isArray(b.userIds) ? b.userIds : undefined,
    tenantId: role === "super_admin" ? (b.tenantId || null) : tenantId,
    roles: Array.isArray(b.roles) ? b.roles : undefined,
    title: String(b.title).slice(0, 120),
    body: b.body ? String(b.body).slice(0, 400) : "",
    icon: typeof b.icon === "string" ? b.icon : undefined,
    url: typeof b.url === "string" && b.url.startsWith("/") ? b.url : undefined,
    onlyTenantId: role === "super_admin" ? null : tenantId,
  });
  if (result.error && result.sent === 0) return NextResponse.json({ error: result.error, sent: 0 });
  return NextResponse.json({ success: true, sent: result.sent, failed: result.failed });
}
