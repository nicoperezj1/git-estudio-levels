import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { sendRetentionEmail } from "@/lib/resend";
import { getInactiveClients, dedupeBy, tenantBookingUrl } from "@/lib/retention";
import { formatPhoneCL } from "@/lib/phone";
import { tryConsumeQuota } from "@/lib/message-quota";
import { tenantHasFeature } from "@/lib/plan-features";

// POST: Send retention message to inactive clients OF THIS BUSINESS.
//
// Two safety guards after the incident where a business with 9 clients emailed 647
// people from OTHER businesses with no confirmation:
//   1. Tenant scoping is MANDATORY. Without a concrete tenant (or for a super_admin's
//      "ALL"), we refuse — a bulk send must never run across every business.
//   2. `preview: true` returns the recipient list WITHOUT sending, so the UI can show a
//      confirmation with a sample before anything goes out.
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { days, couponCode, message, type, preview } = body; // type: 'email' | 'whatsapp'

  // Resolve and REQUIRE a single tenant. This is the fix for the cross-business leak:
  // the query below used to hit every client of every business (service-role bypasses
  // RLS). "ALL" (super_admin) is rejected too — a mass send must target one business.
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json(
      { error: "No se pudo identificar el negocio. Recarga la pagina e intenta de nuevo." },
      { status: 400 }
    );
  }

  // Item 34 (Nico, 26-sep): "Mensajes masivos" es feature de plan (Starter+, Basic no la
  // incluye). Se corta antes del preview tambien — si el plan no lo tiene, no hay nada que
  // previsualizar.
  if (!(await tenantHasFeature(tenantId, "whatsapp_bulk"))) {
    return NextResponse.json({ error: "Los mensajes masivos no estan incluidos en tu plan actual. Mejora tu plan para usarlos." }, { status: 403 });
  }

  // "Quien esta inactivo" sale de la MISMA funcion que usa la pantalla de Retencion
  // (lib/retention): mismo corte de dias, misma ventana desde el inicio real del negocio y
  // sin clientes que ya tienen una cita por venir.
  const { inactive: inactiveClients } = await getInactiveClients(supabase, tenantId, days || 30);
  const bookingUrl = await tenantBookingUrl(supabase, tenantId);

  // Detalle del cupon (del propio negocio) para el correo: sin esto el correo decia
  // "$undefined de descuento" porque solo se enviaba el codigo.
  let coupon: { code: string; description: string | null; discount_type: string; discount_value: number } | null = null;
  if (couponCode) {
    const { data: c } = await supabase
      .from("coupons")
      .select("code, description, discount_type, discount_value")
      .eq("code", String(couponCode).toUpperCase())
      .eq("tenant_id", tenantId)
      .single();
    coupon = c || null;
  }

  if (type === "email") {
    // Un solo correo por direccion: dos fichas con el mismo email no reciben doble mensaje
    // (ni gastan cupo dos veces).
    const withEmail = dedupeBy(inactiveClients.filter((c) => c.email), (c) => c.email!.trim().toLowerCase());

    // Preview mode: return who WOULD receive it + a small sample, send nothing.
    if (preview) {
      return NextResponse.json({
        preview: true,
        total: withEmail.length,
        sample: withEmail.slice(0, 5).map((c) => ({ name: c.name, email: c.email })),
      });
    }

    // Cuenta contra el cupo de correos del negocio (Nico, 27-sep: envios masivos de
    // retencion si cuentan). Se detiene apenas se agota — el resto queda sin enviar y se
    // informa en la respuesta.
    let sent = 0;
    let quotaExceeded = false;
    for (const client of withEmail) {
      const allowed = await tryConsumeQuota(tenantId, "email", "retention");
      if (!allowed) {
        quotaExceeded = true;
        break;
      }
      try {
        await sendRetentionEmail({
          to: client.email!,
          clientName: client.name,
          message: message || "Te extrañamos! Vuelve pronto.",
          couponCode: coupon?.code || null,
          couponDescription: coupon?.description || null,
          discountType: coupon?.discount_type || null,
          discountValue: coupon ? Number(coupon.discount_value) : null,
          bookingUrl,
        });
        sent++;
      } catch (e) {
        console.error(`Error sending to ${client.email}:`, e);
      }
    }

    return NextResponse.json({ success: true, sent, total: withEmail.length, quotaExceeded });
  }

  if (type === "whatsapp") {
    const withPhone = dedupeBy(inactiveClients.filter((c) => c.phone), (c) => formatPhoneCL(c.phone!));

    if (preview) {
      return NextResponse.json({
        preview: true,
        total: withPhone.length,
        sample: withPhone.slice(0, 5).map((c) => ({ name: c.name, phone: c.phone })),
      });
    }

    // Cada link generado aqui cuenta contra el cupo de WhatsApp del negocio (es un envio
    // masivo deliberado, no una recarga de pantalla como en /cron/reminders/whatsapp, asi
    // que no hace falta el dedup por referenceId — cada ejecucion de este boton es una
    // tanda nueva de mensajes). Se corta la lista apenas se agota el cupo.
    const links: Array<{ name: string; phone: string | null; url: string }> = [];
    let quotaExceeded = false;
    for (const c of withPhone) {
      const allowed = await tryConsumeQuota(tenantId, "whatsapp", "retention");
      if (!allowed) {
        quotaExceeded = true;
        break;
      }
      const phone = c.phone!.replace(/\D/g, "").replace(/^0/, "56");
      const whatsappPhone = phone.startsWith("56") ? phone : `56${phone}`;
      let msg = message || `Hola ${c.name}! Te extrañamos.`;
      if (couponCode) msg += `\n\nUsa tu cupon: ${couponCode}`;
      msg += `\n\nAgenda: ${bookingUrl}`;

      links.push({
        name: c.name,
        phone: c.phone,
        url: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(msg)}`,
      });
    }

    return NextResponse.json({ success: true, links, total: links.length, quotaExceeded });
  }

  return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
}
