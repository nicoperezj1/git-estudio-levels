import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { createAnnualRenewalLink } from "@/lib/annual-renewal";

// Vercel Cron (diario): el plan ANUAL es un pago unico y NO se renueva solo.
//   - Avisa por email con un link de pago a los 30, 7 y 1 dia antes de vencer
//     (subscriptions.renewal_reminder_stage evita repetir el mismo aviso).
//   - Si vencio sin pago, pasa a past_due con 2 dias de gracia; despues el cron
//     /api/cron/suspend-past-due suspende el negocio.
// Las suscripciones canceladas por el negocio no reciben avisos.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = new Date();

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, plan, status, current_period_end, renewal_reminder_stage")
    .eq("billing_period", "annual")
    .is("mp_preapproval_id", null)
    .in("status", ["active", "past_due"]);

  let reminded = 0;
  let expired = 0;

  for (const sub of subs || []) {
    if (!sub.current_period_end) continue;
    const end = new Date(sub.current_period_end);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);

    if (daysLeft <= 0) {
      if (sub.status === "active") {
        const graceUntil = new Date(end);
        graceUntil.setDate(graceUntil.getDate() + 2);
        await supabase
          .from("subscriptions")
          .update({ status: "past_due", grace_until: graceUntil.toISOString() })
          .eq("id", sub.id);
        await supabase.from("tenants").update({ status: "past_due" }).eq("id", sub.tenant_id).eq("status", "active");
        expired++;
      }
      continue;
    }

    const targetStage = daysLeft <= 1 ? 3 : daysLeft <= 7 ? 2 : daysLeft <= 30 ? 1 : 0;
    if (targetStage <= (sub.renewal_reminder_stage || 0)) continue;

    const link = await createAnnualRenewalLink(supabase, sub.id);
    if (!link.ok || !link.adminEmail) continue;

    try {
      const { getResendClient } = await import("@/lib/resend-client");
      const resend = getResendClient();
      const fecha = end.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
        to: link.adminEmail,
        subject: daysLeft <= 1 ? "Tu plan re-booking vence manana" : `Tu plan re-booking vence en ${daysLeft} dias`,
        html: `
<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #F5F7FA;">
  <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
    <h1 style="color: #1F2937; margin: 0 0 12px; font-size: 22px;">Renueva tu plan anual</h1>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Tu plan de re-booking vence el <strong>${fecha}</strong>. Tu plan anual no se renueva automaticamente:
      para seguir usando el sistema sin interrupciones, renuevalo con el siguiente boton.
    </p>
    <p style="color: #1F2937; font-size: 15px;">Total: <strong>$${link.amount.toLocaleString("es-CL")}</strong> (IVA incluido)</p>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${link.initPoint}" style="display: inline-block; background: #0F8B8D; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: bold; font-size: 14px;">Renovar con Mercado Pago</a>
    </div>
    <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">Tambien puedes renovar desde Configuracion &gt; Plan y facturacion.</p>
  </div>
</div>`,
      });
      await supabase.from("subscriptions").update({ renewal_reminder_stage: targetStage }).eq("id", sub.id);
      reminded++;
    } catch (e) {
      console.error("[annual-renewals] error enviando aviso:", e);
    }
  }

  return NextResponse.json({ reminded, expired });
}
