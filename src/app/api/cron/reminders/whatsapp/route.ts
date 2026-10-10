import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { chileDateOffset } from "@/lib/utils";
import { tryConsumeQuota } from "@/lib/message-quota";

// Returns WhatsApp links for tomorrow's appointments (for manual batch sending)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);

  // Scope to the caller's business. This is consumed by the Recordatorios page; without
  // the tenant filter it listed tomorrow's appointments of EVERY business, which is how
  // Saray saw other salons' reminders. SEGURIDAD: nunca confiar directo en el tenantId de
  // la URL — resolveTenantForRequest lo reemplaza por el negocio real del usuario logueado
  // salvo que sea super_admin.
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") return NextResponse.json([]);

  // Accept date param from frontend (lets Recordatorios manage any day, not just
  // "tomorrow" — see Punto 4). Falls back to tomorrow in Chile's calendar if omitted.
  let targetDateStr = searchParams.get("date");

  if (!targetDateStr) {
    targetDateStr = chileDateOffset(1);
  }

  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id, start_time,
      client:clients(name, phone),
      barber:profiles(name),
      services:appointment_services(
        service:services(name)
      )
    `)
    .eq("date", targetDateStr)
    .eq("tenant_id", tenantId)
    .in("status", ["scheduled", "confirmed"])
    .order("start_time");

  if (!appointments) return NextResponse.json([]);

  const bookingUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";

  // Punto 4 (Nico): el mensaje decia "manana" fijo, pero ahora la fecha puede ser
  // cualquier dia elegido en el selector, asi que el texto debe reflejar el dia real.
  const [ty, tm, td] = targetDateStr.split("-").map(Number);
  const friendlyDate = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(Date.UTC(ty, tm - 1, td, 12)));

  // Cupo de WhatsApp (Nico, 27-sep): esta ruta se re-pide cada vez que la pagina de
  // Recordatorios carga o cambia de fecha, asi que no se puede simplemente descontar 1 por
  // link en cada GET (recargar la pagina agotaria el cupo sin enviar nada). tryConsumeQuota
  // con referenceId=appointmentId hace esto idempotente: la primera vez que se ve una cita
  // descuenta cupo, las siguientes veces (mismo dia, misma cita) no vuelve a descontar. Si
  // el cupo ya esta agotado para una cita nueva, no se genera su link (whatsappUrl: null).
  const links = await Promise.all(
    (appointments || []).map(async (a: any) => {
      const client = a.client;
      const barber = a.barber;
      const services = (a.services || []).map((s: any) => s.service?.name).filter(Boolean).join(", ");
      const timeMatch = a.start_time?.match(/(\d{2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : "";

      const phone = client?.phone?.replace(/\D/g, "")?.replace(/^0/, "56") || "";
      const whatsappPhone = phone.startsWith("56") ? phone : `56${phone}`;

      const message = `Hola ${client?.name || ""}! Te recordamos tu cita del ${friendlyDate}:\n\n` +
        `Servicio: ${services}\n` +
        `Profesional: ${barber?.name || "Tu profesional"}\n` +
        `Hora: ${time}\n\n` +
        `Te esperamos!\n` +
        `Si necesitas cancelar: 9 4266 6172`;

      let quotaOk = true;
      if (phone) {
        quotaOk = await tryConsumeQuota(tenantId, "whatsapp", "reminder", a.id);
      }

      return {
        appointmentId: a.id,
        clientName: client?.name || "Sin cliente",
        phone: client?.phone || null,
        time,
        service: services,
        barber: barber?.name,
        whatsappUrl: phone && quotaOk ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}` : null,
        quotaExceeded: phone && !quotaOk,
      };
    })
  );

  return NextResponse.json(links);
}
