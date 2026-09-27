import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendRetentionEmail } from "@/lib/resend";
import { tryConsumeQuota } from "@/lib/message-quota";

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { clientId, type, couponCode, message } = body;

  // Get client
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, tenant_id")
    .eq("id", clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Get coupon details if provided
  let couponDetails = null;
  if (couponCode) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("code, description, discount_type, discount_value")
      .eq("code", couponCode.toUpperCase())
      .single();
    couponDetails = coupon;
  }

  if (type === "email") {
    if (!client.email) {
      return NextResponse.json({ error: "Cliente no tiene email" }, { status: 400 });
    }

    if (client.tenant_id) {
      const allowed = await tryConsumeQuota(client.tenant_id, "email", "retention");
      if (!allowed) {
        return NextResponse.json({ error: "Se agoto el cupo de correos de este mes. Mejora tu plan o compra mas para seguir enviando." }, { status: 403 });
      }
    }

    try {
      await sendRetentionEmail({
        to: client.email,
        clientName: client.name,
        message: message || "Te extrañamos! Vuelve pronto.",
        couponCode: couponDetails?.code || null,
        couponDescription: couponDetails?.description || null,
        discountType: couponDetails?.discount_type || null,
        discountValue: couponDetails ? Number(couponDetails.discount_value) : null,
      });
      return NextResponse.json({ success: true, channel: "email" });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (type === "whatsapp") {
    if (!client.phone) {
      return NextResponse.json({ error: "Cliente no tiene telefono" }, { status: 400 });
    }

    if (client.tenant_id) {
      const allowed = await tryConsumeQuota(client.tenant_id, "whatsapp", "retention");
      if (!allowed) {
        return NextResponse.json({ error: "Se agoto el cupo de WhatsApp de este mes. Mejora tu plan o compra mas para seguir enviando." }, { status: 403 });
      }
    }

    // Generate WhatsApp URL
    const phone = client.phone.replace(/\D/g, "").replace(/^0/, "56");
    const whatsappPhone = phone.startsWith("56") ? phone : `56${phone}`;

    let whatsappMessage = message || `Hola ${client.name}! Te extrañamos. Agenda tu proxima cita.`;
    if (couponDetails) {
      const discount = couponDetails.discount_type === "percentage"
        ? `${couponDetails.discount_value}%`
        : `$${Number(couponDetails.discount_value).toLocaleString("es-CL")}`;
      whatsappMessage += `\n\nTenemos un cupon de descuento para ti: ${couponDetails.code} (${discount} off)`;
    }
    whatsappMessage += `\n\nAgenda aqui: ${process.env.NEXT_PUBLIC_APP_URL || "https://barberia-kappa-weld.vercel.app"}/booking`;

    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

    return NextResponse.json({ success: true, channel: "whatsapp", url: whatsappUrl });
  }

  return NextResponse.json({ error: "Tipo de notificacion invalido" }, { status: 400 });
}
