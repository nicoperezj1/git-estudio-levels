import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { handlePreapprovalUpdate } from "@/lib/subscription-webhook";

// GET: Polled by /suscripcion/resultado right after the MP redirect, to know whether
// the webhook has already provisioned the tenant (webhook usually beats the redirect,
// but not always) so we can show "cuenta lista" instead of a generic "pago recibido".
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reqRaw = searchParams.get("req");
  const reqId = reqRaw?.match(/^[0-9a-fA-F-]{36}/)?.[0] ?? reqRaw;
  if (!reqId) return NextResponse.json({ error: "req required" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data } = await supabase.from("signup_requests").select("status").eq("id", reqId).single();

  let status = data?.status || "pending";

  // Respaldo: si MP no alcanzo a avisar por webhook (o lo hizo antes de tiempo), al volver el
  // cliente ejecutamos la misma logica del webhook. No se confia en el cliente:
  // consulta la suscripcion a MP y solo crea el negocio si esta "authorized" y coincide con el signup.
  const preapprovalId = searchParams.get("preapproval_id");
  if (status === "pending" && preapprovalId && /^[0-9a-zA-Z]+$/.test(preapprovalId)) {
    try {
      const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;
      if (accessToken) await handlePreapprovalUpdate(preapprovalId, accessToken, supabase);
      const { data: again } = await supabase.from("signup_requests").select("status").eq("id", reqId).single();
      status = again?.status || status;
    } catch (e) {
      console.error("[subscribe/status] respaldo webhook fallo:", e);
    }
  }

  return NextResponse.json({ status });
}
