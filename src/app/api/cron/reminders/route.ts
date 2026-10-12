import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendAppointmentReminder } from "@/lib/resend";
import { tryConsumeQuota } from "@/lib/message-quota";

// This endpoint is called by Vercel Cron Jobs every hour
// It finds appointments in the next 24h that haven't been reminded yet

export async function GET(req: NextRequest) {
  // Verify cron secret (prevents unauthorized calls)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without secret
    if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
      // No secret configured, allow
    } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminSupabase();

  // Reuniones de la plataforma que empiezan en la proxima hora (aviso al super admin que la creo). Tolera que falte la migracion 111.
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    const today = `${g("year")}-${g("month")}-${g("day")}`;
    const nowMin = (Number(g("hour")) % 24) * 60 + Number(g("minute"));
    const { data: meetings, error: mErr } = await supabase.from("platform_meetings").select("id, title, start_time, link, created_by").eq("meeting_date", today).is("reminded_at", null);
    if (!mErr && meetings) {
      const { sendPush } = await import("@/lib/push");
      for (const m of meetings as any[]) {
        const [h, mi] = String(m.start_time).split(":").map(Number);
        const diff = h * 60 + mi - nowMin;
        if (diff > 0 && diff <= 75 && m.created_by) {
          await sendPush({ userId: m.created_by, title: "📅 Reunión pronto", body: `${m.title} · ${m.start_time}`, url: "/dashboard/superadmin/reuniones" });
          await supabase.from("platform_meetings").update({ reminded_at: new Date().toISOString() }).eq("id", m.id);
        }
      }
    }
  } catch (e) {
    console.error("[reminders] reuniones:", e);
  }

  // Find appointments in the next 20-28 hours that haven't been reminded
  const now = new Date();
  const in20Hours = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  const in28Hours = new Date(now.getTime() + 28 * 60 * 60 * 1000);

  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id, start_time, date, tenant_id,
      client:clients(id, name, email, phone),
      barber:profiles(name),
      services:appointment_services(
        service:services(name, duration)
      )
    `)
    .in("status", ["scheduled", "confirmed"])
    .eq("reminder_sent", false)
    .gte("start_time", in20Hours.toISOString())
    .lte("start_time", in28Hours.toISOString());

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ message: "No reminders to send", count: 0 });
  }

  let emailsSent = 0;
  let whatsappGenerated = 0;
  const results: Array<{ appointmentId: string; email: boolean; whatsapp: boolean }> = [];

  for (const appt of appointments) {
    const client = appt.client as any;
    const barber = appt.barber as any;
    const services = (appt.services as any[]) || [];

    if (!client) continue;

    const serviceName = services.map((s: any) => s.service?.name).filter(Boolean).join(", ") || "Servicio";
    const startTime = new Date(appt.start_time);
    let emailSent = false;
    let whatsappReady = false;

    // Send email reminder (cuenta contra el cupo de correos del negocio).
    if (client.email) {
      try {
        const tenantId = (appt as any).tenant_id as string | null;
        const allowed = !tenantId || (await tryConsumeQuota(tenantId, "email", "reminder", appt.id));
        if (allowed) {
          await sendAppointmentReminder({
            to: client.email,
            clientName: client.name,
            barberName: barber?.name || "Tu profesional",
            serviceName,
            date: startTime,
            appointmentId: appt.id,
          });
          emailSent = true;
          emailsSent++;
        } else {
          console.warn(`Cupo de correos agotado para tenant ${tenantId}, no se envia recordatorio a ${client.email}`);
        }
      } catch (e) {
        console.error(`Error sending reminder to ${client.email}:`, e);
      }
    }

    // Mark WhatsApp as ready (actual sending via WhatsApp API would go here)
    if (client.phone) {
      whatsappReady = true;
      whatsappGenerated++;
    }

    // Mark as reminded
    await supabase
      .from("appointments")
      .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
      .eq("id", appt.id);

    results.push({ appointmentId: appt.id, email: emailSent, whatsapp: whatsappReady });
  }

  return NextResponse.json({
    message: `Reminders processed`,
    total: appointments.length,
    emailsSent,
    whatsappGenerated,
    results,
  });
}
