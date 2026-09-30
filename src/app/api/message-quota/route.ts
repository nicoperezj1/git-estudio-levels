import { NextRequest, NextResponse } from "next/server";
import { resolveTenantForRequest } from "@/lib/supabase/server";
import { getQuotaStatus } from "@/lib/message-quota";

// Estado de cuota de WhatsApp + correos del negocio del usuario logueado, para la barra de
// uso en Configuracion (pedido de Nico, 27-sep: "similar a la opcion que tiene Claude").
// Solo lectura — no consume cupo.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo identificar el negocio." }, { status: 400 });
  }

  const [whatsapp, email] = await Promise.all([
    getQuotaStatus(tenantId, "whatsapp"),
    getQuotaStatus(tenantId, "email"),
  ]);

  return NextResponse.json({ whatsapp, email });
}
