import webpush from "web-push";
import { createAdminSupabase } from "@/lib/supabase/server";

// Envio de notificaciones push. Vive aqui (y no solo en la ruta HTTP) para que las rutas del servidor
// (reserva online, webhook de deposito, cita creada, cliente llego) lo llamen DIRECTO, sin hacer una
// peticion HTTP sin sesion a /api/push/send. Asi esa ruta puede exigir sesion sin romper los avisos.
// Cuando exista la app movil, el segundo canal (FCM) se agrega aqui y todos los avisos lo usan.

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@re-booking.cl";

let configured = false;
function configure(): boolean {
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    configured = true;
  }
  return true;
}

export interface PushInput {
  userId?: string | null;
  userIds?: string[];
  tenantId?: string | null; // + roles: todos los de ese negocio con alguno de esos roles
  roles?: string[];
  title: string;
  body?: string;
  icon?: string;
  url?: string;
  // Si se indica, solo se envia a personas de este negocio (lo usa la ruta HTTP para que nadie
  // pueda avisarle a gente de otro negocio).
  onlyTenantId?: string | null;
}

export interface PushResult { sent: number; failed: number; recipients: number; error?: string }

export async function sendPush(input: PushInput): Promise<PushResult> {
  if (!input.title) return { sent: 0, failed: 0, recipients: 0, error: "title required" };
  if (!configure()) return { sent: 0, failed: 0, recipients: 0, error: "VAPID keys not configured" };

  const supabase = createAdminSupabase();
  const ids = new Set<string>();
  if (input.userId) ids.add(input.userId);
  (input.userIds || []).forEach((id) => id && ids.add(id));
  if (input.tenantId && input.roles && input.roles.length > 0) {
    const { data: staff } = await supabase
      .from("profiles").select("id")
      .eq("tenant_id", input.tenantId).in("role", input.roles).eq("active", true);
    (staff || []).forEach((s: any) => ids.add(s.id));
  }
  if (ids.size === 0) return { sent: 0, failed: 0, recipients: 0, error: "No recipients" };

  let recipients = Array.from(ids);
  if (input.onlyTenantId) {
    const { data: rows } = await supabase.from("profiles").select("id").eq("tenant_id", input.onlyTenantId).in("id", recipients);
    recipients = (rows || []).map((r: any) => r.id);
    if (recipients.length === 0) return { sent: 0, failed: 0, recipients: 0, error: "No recipients" };
  }

  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", recipients);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, recipients: recipients.length, error: "No push subscriptions for recipients" };

  const payload = JSON.stringify({
    title: input.title,
    body: input.body || "",
    icon: input.icon || "/logo-icon.png",
    badge: "/logo-icon.png",
    url: input.url || "/dashboard",
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err: any) {
      failed++;
      // Suscripcion vencida: se elimina
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }
  return { sent, failed, recipients: recipients.length };
}
