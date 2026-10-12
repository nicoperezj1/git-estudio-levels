import { createAdminSupabase } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

// Avisos de la PLATAFORMA para los super admin (nunca para los negocios, y nunca sobre lo que pasa dentro de
// un negocio: citas, clientes, ventas). Solo eventos de cuenta: negocio nuevo, pago fallido, suspension,
// cancelacion, trial o plan por vencer. Dos canales: push (web y app) y correo (por si el push no llega).
// Nunca lanza errores: un aviso que falla no debe romper un registro ni un cobro.

export type PlatformAlertKind =
  | "tenant_new" | "payment_failed" | "tenant_suspended" | "subscription_cancelled"
  | "trial_ending" | "plan_ending";

const ICON: Record<PlatformAlertKind, string> = {
  tenant_new: "🎉", payment_failed: "⚠️", tenant_suspended: "⛔", subscription_cancelled: "😕",
  trial_ending: "⏳", plan_ending: "⏳",
};

export async function notifyPlatform(input: { kind: PlatformAlertKind; title: string; body?: string; url?: string }): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    const { data: admins } = await supabase.from("profiles").select("id, email").eq("role", "super_admin").eq("active", true);
    if (!admins || admins.length === 0) return;
    const title = `${ICON[input.kind]} ${input.title}`;
    const url = input.url || "/dashboard/superadmin/tenants";

    try {
      await sendPush({ userIds: admins.map((a: any) => a.id), title, body: input.body, url });
    } catch (e) {
      console.error("[platform-alerts] push:", e);
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const { getResendClient } = await import("@/lib/resend-client");
        const resend = getResendClient();
        const esc = (t: string) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";
        const emails = admins.map((a: any) => a.email).filter(Boolean);
        if (emails.length > 0) {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
            to: emails,
            subject: `${title}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#F4F6F8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:28px;">
<img src="https://www.re-booking.cl/logo-horizontal.png" alt="re-booking" height="30" style="height:30px;width:auto;border:0;margin-bottom:18px;" />
<h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${esc(title)}</h2>
${input.body ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.5;">${esc(input.body)}</p>` : ""}
<a href="${base}${url}" style="display:inline-block;background:#0F8B8D;color:#fff;text-decoration:none;padding:11px 24px;border-radius:10px;font-weight:700;font-size:14px;">Abrir en re-booking</a>
</div></body></html>`,
          });
        }
      } catch (e) {
        console.error("[platform-alerts] correo:", e);
      }
    }
  } catch (e) {
    console.error("[platform-alerts] error ignorado:", e);
  }
}

export async function tenantLabel(supabase: any, tenantId: string): Promise<string> {
  try {
    const { data } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    return data?.name || "Un negocio";
  } catch {
    return "Un negocio";
  }
}
