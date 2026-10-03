import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// SEGURIDAD: antes tomaba el userId del cuerpo y no pedia sesion: cualquiera podia suscribir su
// dispositivo a los avisos de otra persona. Ahora el dueño de la suscripcion es SIEMPRE quien tiene la sesion.
export async function POST(req: NextRequest) {
  const { userId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({} as any));
  const { subscription } = body;

  if (!subscription?.endpoint || !subscription?.keys) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { endpoint, keys } = subscription;

  await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "user_id,endpoint" }
  );

  return NextResponse.json({ success: true });
}
