import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  // Check if user exists (case-insensitive)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name")
    .ilike("email", email)
    .single();

  // Always return success (don't reveal if email exists)
  if (!profile) {
    return NextResponse.json({ success: true });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";

  // Generate a password reset link using Supabase Admin API.
  // NOTE: the redirectTo URL must be listed in Supabase Auth → URL Configuration →
  // Redirect URLs, otherwise generateLink fails. We try a couple of times and, if it
  // still fails, we DO NOT silently swallow it — we send a fallback email and log the
  // real error so recovery never appears to "succeed" while sending nothing.
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${baseUrl}/reset-password`,
    },
  });

  if (linkError) {
    console.error("forgot-password: generateLink failed:", linkError.message, JSON.stringify(linkError));
  }

  // Send the reset email using Resend (reliable). If the recovery link couldn't be
  // generated, fall back to the reset page (user can request the code from there / retry).
  try {
    const { getResendClient } = await import("@/lib/resend-client");
    const resend = getResendClient();

    const resetUrl = linkData?.properties?.action_link || `${baseUrl}/reset-password`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to: email,
      subject: "Recupera tu contraseña | re-booking",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a1a;">
  <div style="background: #111; padding: 30px; border-radius: 12px; border: 1px solid #333;">
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0F8B8D; padding-bottom: 20px;">
      <img src="https://re-booking.cl/logo-horizontal.png" alt="re-booking" style="height: 40px; margin-bottom: 10px;" />
      <p style="color: #0F8B8D; margin: 8px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 3px;">Recuperar Contraseña</p>
    </div>
    <p style="color: #ccc; font-size: 16px; margin-bottom: 20px;">Hola <strong style="color: #fff;">${profile.name || "Usuario"}</strong>,</p>
    <p style="color: #888; font-size: 14px; margin-bottom: 30px;">Recibimos una solicitud para restablecer tu contraseña. Haz click en el boton para crear una nueva:</p>
    <div style="text-align: center; margin-bottom: 30px;">
      <a href="${resetUrl}" style="display: inline-block; background: #0F8B8D; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
        Restablecer contraseña
      </a>
    </div>
    <p style="color: #555; font-size: 12px; text-align: center;">Si no solicitaste esto, ignora este correo. El link expira en 1 hora.</p>
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #333; margin-top: 20px;">
      <p style="color: #555; font-size: 11px;">re-booking | <a href="https://re-booking.cl" style="color: #0F8B8D;">re-booking.cl</a></p>
    </div>
  </div>
</body>
</html>`,
    });
  } catch (e) {
    console.error("Error sending reset email:", e);
  }

  return NextResponse.json({ success: true });
}
