import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET: Send post-service thank you email + review request
// Called by cron every hour — checks for appointments completed in the last 2 hours
export async function GET() {
  const supabase = createAdminSupabase();

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Get recently completed appointments that haven't received the post-service email
  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id, date, start_time,
      client:clients(id, name, email, phone),
      barber:profiles(name),
      services:appointment_services(service:services(name))
    `)
    .eq("status", "completed")
    .eq("post_service_sent", false)
    .gte("updated_at", twoHoursAgo)
    .lte("updated_at", now);

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: "No completed appointments to follow up" });
  }

  let sent = 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";

  for (const appt of appointments) {
    const client = appt.client as any;
    const barber = appt.barber as any;
    const services = (appt.services as any[])?.map((s: any) => s.service?.name).join(" + ") || "Servicio";

    if (!client?.email) continue;

    try {
      const { getResendClient } = await import("@/lib/resend-client");
      const resend = getResendClient();

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
        to: client.email,
        subject: `Gracias por tu visita! — Califica tu experiencia`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #F5F7FA;">
  <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #1F2937; margin: 0; font-size: 22px;">Gracias por tu visita! 🙌</h1>
    </div>

    <p style="color: #1F2937; font-size: 15px;">Hola <strong>${client.name}</strong>,</p>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Esperamos que hayas disfrutado tu experiencia con <strong>${barber?.name || "nosotros"}</strong>.
      Tu opinion nos ayuda a mejorar!
    </p>

    <div style="background: #F5F7FA; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #6B7280;">Servicio:</p>
      <p style="margin: 0; font-size: 16px; font-weight: bold; color: #1F2937;">${services}</p>
      <p style="margin: 8px 0 0; font-size: 12px; color: #6B7280;">${new Date(appt.date + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long" })} · ${barber?.name}</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${appUrl}/review/${appt.id}" style="display: inline-block; background: #0F8B8D; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: bold; font-size: 15px;">
        Califica tu experiencia ★
      </a>
    </div>

    <p style="color: #6B7280; font-size: 12px; text-align: center;">
      Tambien puedes agendar tu proxima visita:
    </p>
    <div style="text-align: center; margin-top: 12px;">
      <a href="${appUrl}/booking" style="color: #0F8B8D; font-size: 13px; font-weight: bold; text-decoration: none;">
        Agendar nueva cita →
      </a>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #6B7280; font-size: 11px; margin: 0;">re-booking · Todo tu negocio. Un solo sistema.</p>
    </div>
  </div>
</body>
</html>`,
      });

      // Mark as sent
      await supabase
        .from("appointments")
        .update({ post_service_sent: true })
        .eq("id", appt.id);

      sent++;
    } catch (e) {
      console.error(`Error sending post-service email to ${client.email}:`, e);
    }
  }

  return NextResponse.json({ sent, total: appointments.length });
}
