import { getResendClient } from "@/lib/resend-client";

interface SendReceiptParams {
  to: string;
  clientName: string;
  transactionId: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  date: Date;
  barberName: string;
  // Business's own logo (tenants.logo_url). Falls back to the generic re-booking
  // logo when the salon hasn't uploaded one.
  businessLogoUrl?: string | null;
  // Nombre del negocio: se muestra si el negocio no tiene logo cargado.
  businessName?: string | null;
}

export async function sendReceipt(params: SendReceiptParams) {
  const {
    to,
    clientName,
    transactionId,
    items,
    subtotal,
    discount,
    total,
    paymentMethod,
    date,
    barberName,
    businessLogoUrl,
    businessName,
  } = params;

  const paymentLabel: Record<string, string> = {
    cash: "Efectivo",
    debit_card: "Tarjeta Debito",
    credit_card: "Tarjeta Credito",
    transfer: "Transferencia",
    mixed: "Mixto",
  };

  const esc = (v: string) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const money = (n: number) => `$${Number(n).toLocaleString("es-CL")}`;
  const FONT = "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const ACCENT = "#0F8B8D"; // color corporativo re-booking
  const dateLabel = new Date(date).toLocaleDateString("es-CL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago",
  });
  const receiptNumber = transactionId.slice(-8).toUpperCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #EEF0F2;font-size:14px;color:#111827;font-weight:600;">${esc(item.description)}</td>
          <td align="center" style="padding:14px 8px;border-bottom:1px solid #EEF0F2;font-size:14px;color:#6B7280;">${item.quantity}</td>
          <td align="right" style="padding:14px 8px;border-bottom:1px solid #EEF0F2;font-size:14px;color:#6B7280;">${money(item.unitPrice)}</td>
          <td align="right" style="padding:14px 0;border-bottom:1px solid #EEF0F2;font-size:14px;color:#111827;font-weight:700;">${money(item.total)}</td>
        </tr>`
    )
    .join("");

  // Encabezado: el logo del negocio es lo principal. Si no tiene, se usa el nombre del
  // negocio en texto y, como ultimo recurso, el logo de re-booking (version a color).
  const headerBrand = businessLogoUrl
    ? `<img src="${esc(businessLogoUrl)}" alt="${esc(businessName || "Logo")}" height="56" style="display:block;height:56px;max-width:240px;width:auto;object-fit:contain;border:0;" />`
    : businessName
      ? `<div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;color:#111827;">${esc(businessName)}</div>`
      : `<img src="https://re-booking.cl/logo-horizontal.png" alt="re-booking" height="32" style="display:block;height:32px;width:auto;border:0;" />`;

  const infoCell = (label: string, value: string) => `
        <td valign="top" style="padding:0 16px 14px 0;width:50%;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">${label}</div>
          <div style="font-size:14px;color:#111827;font-weight:600;margin-top:3px;">${value}</div>
        </td>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Boleta ${receiptNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>
</head>
<body bgcolor="#F4F6F8" style="margin:0;padding:0;background:#F4F6F8;font-family:${FONT};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F8" style="background:#F4F6F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;">
      <tr><td style="height:4px;background:${ACCENT};border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px 36px 8px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">${headerBrand}</td>
          <td valign="middle" align="right">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT};font-weight:700;">Boleta</div>
            <div style="font-size:16px;color:#111827;font-weight:800;margin-top:2px;">N° ${receiptNumber}</div>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:20px 36px 4px 36px;">
        <div style="border-top:1px solid #EEF0F2;padding-top:22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${infoCell("Fecha", dateLabel)}${infoCell("Cliente", esc(clientName))}</tr>
            <tr>${infoCell("Profesional", esc(barberName))}${infoCell("Forma de pago", esc(paymentLabel[paymentMethod] || paymentMethod))}</tr>
          </table>
        </div>
      </td></tr>

      <tr><td style="padding:8px 36px 0 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <thead>
            <tr>
              <th align="left" style="padding:10px 0;border-bottom:2px solid #111827;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;font-weight:700;">Detalle</th>
              <th align="center" style="padding:10px 8px;border-bottom:2px solid #111827;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;font-weight:700;">Cant.</th>
              <th align="right" style="padding:10px 8px;border-bottom:2px solid #111827;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;font-weight:700;">Precio</th>
              <th align="right" style="padding:10px 0;border-bottom:2px solid #111827;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;font-weight:700;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </td></tr>

      <tr><td style="padding:18px 36px 8px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="right" style="padding:3px 0;font-size:14px;color:#6B7280;">Subtotal</td>
            <td align="right" width="130" style="padding:3px 0;font-size:14px;color:#111827;font-weight:600;">${money(subtotal)}</td>
          </tr>
          ${discount > 0 ? `<tr>
            <td align="right" style="padding:3px 0;font-size:14px;color:${ACCENT};">Descuento</td>
            <td align="right" width="130" style="padding:3px 0;font-size:14px;color:${ACCENT};font-weight:600;">-${money(discount)}</td>
          </tr>` : ""}
          <tr>
            <td align="right" style="padding:14px 0 0 0;font-size:14px;color:#111827;font-weight:700;">Total pagado</td>
            <td align="right" width="130" style="padding:14px 0 0 0;font-size:24px;color:#111827;font-weight:800;letter-spacing:-0.4px;">${money(total)}</td>
          </tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:28px 36px 8px 36px;">
        <a href="${appUrl}/review/${transactionId}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;">Califica tu atención</a>
        <div style="font-size:13px;color:#6B7280;margin-top:14px;">¡Gracias por tu preferencia!</div>
      </td></tr>

      <tr><td style="padding:0 0 12px 0;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
    to,
    subject: `Tu boleta${businessName ? ` de ${businessName}` : ""} - ${new Date(date).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`,
    html,
  });

  if (error) {
    throw new Error(`Error enviando email: ${error.message}`);
  }

  return data;
}



// ==================== DISEÑO COMUN (claro, igual que la boleta) ====================
const MAIL_ACCENT = "#0F8B8D";
const MAIL_FONT = "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function mailShell(opts: { label: string; inner: string; businessLogoUrl?: string | null }): string {
  const logo = opts.businessLogoUrl
    ? `<img src="${opts.businessLogoUrl}" alt="Logo" height="52" style="display:block;margin:0 auto;height:52px;max-width:220px;width:auto;object-fit:contain;border:0;" />`
    : `<img src="https://www.re-booking.cl/logo-horizontal.png" alt="re-booking" height="36" style="display:block;margin:0 auto;height:36px;width:auto;border:0;" />`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>
</head>
<body bgcolor="#F4F6F8" style="margin:0;padding:0;background:#F4F6F8;font-family:${MAIL_FONT};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F8" style="background:#F4F6F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;">
      <tr><td style="height:4px;background:${MAIL_ACCENT};border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center" style="padding:32px 36px 8px 36px;">${logo}
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MAIL_ACCENT};font-weight:700;margin-top:14px;">${opts.label}</div>
      </td></tr>
      <tr><td style="padding:12px 36px 32px 36px;">${opts.inner}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function mailRow(label: string, value: string, strong = false): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #EEF0F2;font-size:13px;color:#6B7280;">${label}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #EEF0F2;font-size:${strong ? 18 : 14}px;color:#111827;font-weight:${strong ? 800 : 600};">${value}</td></tr>`;
}

interface SendBookingConfirmationParams {
  to: string;
  clientName: string;
  barberName: string;
  serviceName: string;
  date: Date;
  duration: number;
  price: number;
  appointmentId?: string;
  // Business's own logo (tenants.logo_url). Falls back to the generic re-booking logo.
  businessLogoUrl?: string | null;
}

export async function sendBookingConfirmation(params: SendBookingConfirmationParams) {
  const { to, clientName, barberName, serviceName, date, duration, price, appointmentId, businessLogoUrl } = params;

  const dateStr = new Date(date).toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = new Date(date).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = mailShell({
    label: "Cita confirmada",
    businessLogoUrl,
    inner: `
    <p style="font-size:16px;color:#374151;margin:12px 0 20px;">Hola <strong style="color:#111827;">${clientName}</strong>, tu cita está confirmada 🎉</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EEF0F2;">
      ${mailRow("Servicio", serviceName)}
      ${mailRow("Profesional", barberName)}
      ${mailRow("Fecha", dateStr)}
      ${mailRow("Hora", timeStr, true)}
      ${mailRow("Duración", `${duration} minutos`)}
      <tr><td style="padding:10px 0;font-size:13px;color:#6B7280;">Precio</td><td align="right" style="padding:10px 0;font-size:18px;color:${MAIL_ACCENT};font-weight:800;">$${price.toLocaleString("es-CL")}</td></tr>
    </table>
    ${appointmentId ? `<div style="text-align:center;margin:26px 0 6px;"><a href="https://www.re-booking.cl/cancel/${appointmentId}" style="display:inline-block;background:${MAIL_ACCENT};color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;">Cancelar o modificar cita</a></div>` : ""}
    <p style="text-align:center;font-size:13px;color:#6B7280;margin:14px 0 0;">¿Dudas? Escríbenos al <strong style="color:#111827;">9 4266 6172</strong></p>
    <p style="text-align:center;font-size:14px;color:#374151;margin:18px 0 0;">¡Te esperamos!</p>`,
  });

  const resend = getResendClient();
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
    to,
    subject: `Cita confirmada - ${serviceName} con ${barberName} | re-booking`,
    html,
  });
}


interface SendRetentionEmailParams {
  to: string;
  clientName: string;
  message: string;
  couponCode: string | null;
  couponDescription: string | null;
  discountType: string | null;
  discountValue: number | null;
  /** Link de reserva del negocio (si no se pasa, cae al link generico de la plataforma). */
  bookingUrl?: string | null;
}

export async function sendRetentionEmail(params: SendRetentionEmailParams) {
  const { to, couponCode, couponDescription, discountType, discountValue } = params;
  // El nombre y el mensaje los escribe el negocio/cliente: se escapan antes de ir al HTML.
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const clientName = esc(params.clientName);
  const message = esc(params.message);

  const couponHtml = couponCode ? `
    <div style="background: #0F8B8D22; border: 2px dashed #0F8B8D; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #0F8B8D; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">Cupon de descuento</p>
      <p style="color: #fff; font-size: 28px; font-weight: bold; font-family: monospace; margin: 0 0 8px;">${couponCode}</p>
      <p style="color: #ccc; font-size: 14px; margin: 0;">
        ${discountType === "percentage" ? `${discountValue}% de descuento` : `$${discountValue?.toLocaleString("es-CL")} de descuento`}
      </p>
      ${couponDescription ? `<p style="color: #888; font-size: 12px; margin: 8px 0 0;">${couponDescription}</p>` : ""}
    </div>
  ` : "";

  const bookingUrl = params.bookingUrl
    ? params.bookingUrl
    : process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/booking`
    : "https://www.re-booking.cl/booking";

  const couponBox = couponCode ? `
    <div style="background:#F0FAFA;border:2px dashed ${MAIL_ACCENT};border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
      <div style="color:${MAIL_ACCENT};font-size:11px;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:8px;">Cupón de descuento</div>
      <div style="color:#111827;font-size:28px;font-weight:800;font-family:monospace;margin-bottom:8px;">${couponCode}</div>
      <div style="color:#374151;font-size:14px;">${discountType === "percentage" ? `${discountValue}% de descuento` : `$${discountValue?.toLocaleString("es-CL")} de descuento`}</div>
      ${couponDescription ? `<div style="color:#6B7280;font-size:12px;margin-top:8px;">${couponDescription}</div>` : ""}
    </div>` : "";
  const html = mailShell({
    label: "Te extrañamos",
    inner: `
    <p style="font-size:18px;color:#111827;font-weight:700;margin:12px 0 8px;">Hola ${clientName}!</p>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 8px;">${message}</p>
    ${couponBox}
    <div style="text-align:center;margin:26px 0 4px;"><a href="${bookingUrl}" style="display:inline-block;background:${MAIL_ACCENT};color:#FFFFFF;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;font-size:15px;">Agendar ahora</a></div>`,
  });

  const resend = getResendClient();
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
    to,
    subject: `Te extrañamos ${params.clientName}! | re-booking`,
    html,
  });
}


interface SendAppointmentReminderParams {
  to: string;
  clientName: string;
  barberName: string;
  serviceName: string;
  date: Date;
  appointmentId?: string;
}

export async function sendAppointmentReminder(params: SendAppointmentReminderParams) {
  const { to, clientName, barberName, serviceName, date, appointmentId } = params;

  const dateStr = new Date(date).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = new Date(date).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const appBase = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";
  const html = mailShell({
    label: "Recordatorio de cita",
    inner: `
    <p style="font-size:18px;color:#111827;font-weight:700;margin:12px 0 6px;">Hola ${clientName}!</p>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 20px;">Te recordamos que tienes una cita agendada para mañana:</p>
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:22px;text-align:center;">
      <div style="font-size:34px;font-weight:800;color:${MAIL_ACCENT};">${timeStr}</div>
      <div style="font-size:14px;color:#374151;margin:2px 0 14px;">${dateStr}</div>
      <div style="border-top:1px solid #E5E7EB;padding-top:12px;font-size:13px;color:#6B7280;">Servicio: <strong style="color:#111827;">${serviceName}</strong><br>Profesional: <strong style="color:#111827;">${barberName}</strong></div>
    </div>
    ${appointmentId ? `<div style="text-align:center;margin:24px 0 4px;">
      <a href="${appBase}/api/public/confirm-attendance?id=${appointmentId}&action=confirm" style="display:inline-block;background:${MAIL_ACCENT};color:#FFFFFF;text-decoration:none;padding:11px 24px;border-radius:10px;font-weight:700;font-size:14px;margin:0 4px 8px;">✓ Asistiré</a>
      <a href="${appBase}/cancel/${appointmentId}" style="display:inline-block;background:#F3F4F6;color:#374151;text-decoration:none;padding:11px 24px;border-radius:10px;font-weight:700;font-size:14px;margin:0 4px 8px;">✕ No podré ir</a>
    </div>` : ""}
    <p style="text-align:center;font-size:13px;color:#6B7280;margin:14px 0 0;">¿Necesitas reprogramar? Escríbenos al <strong style="color:#111827;">9 4266 6172</strong></p>
    <p style="text-align:center;font-size:14px;color:#374151;margin:18px 0 0;">¡Te esperamos!</p>`,
  });

  const resend = getResendClient();
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
    to,
    subject: `Recordatorio: ${serviceName} manana a las ${timeStr} | re-booking`,
    html,
  });
}


// ==================== WELCOME EMAIL FOR NEW PROFESSIONALS ====================

interface SendWelcomeParams {
  to: string;
  professionalName: string;
  businessName: string;
  password: string;
  loginUrl: string;
}

export async function sendWelcomeEmail(params: SendWelcomeParams) {
  const { to, professionalName, businessName, password, loginUrl } = params;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #F5F7FA; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #0F8B8D, #2EC4B6); padding: 32px 24px; text-align: center;">
      <img src="https://re-booking.cl/logo-horizontal-white.png" alt="re-booking" style="height: 32px; max-width: 240px; object-fit: contain; margin-bottom: 14px;" />
      <h1 style="color: white; margin: 0; font-size: 22px;">Bienvenido a bordo</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${businessName} te ha agregado como profesional</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #1F2937; font-size: 15px; margin: 0 0 20px;">Hola <strong>${professionalName}</strong>,</p>
      <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Ya tienes tu cuenta lista en re-booking. Desde ahi podras ver tu agenda, registrar servicios y gestionar tus comisiones.
      </p>
      
      <div style="background: #F5F7FA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #6B7280; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Tus credenciales</p>
        <p style="color: #1F2937; font-size: 14px; margin: 0 0 6px;"><strong>Email:</strong> ${to}</p>
        <p style="color: #1F2937; font-size: 14px; margin: 0;"><strong>Contraseña:</strong> ${password}</p>
      </div>

      <a href="${loginUrl}" style="display: block; text-align: center; background: #0F8B8D; color: white; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Iniciar sesion
      </a>

      <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 20px 0 0;">
        Te recomendamos cambiar tu contraseña despues del primer ingreso.
      </p>
    </div>
    <div style="border-top: 1px solid #F3F4F6; padding: 16px 24px; text-align: center;">
      <p style="color: #9CA3AF; font-size: 11px; margin: 0;">re-booking · Todo tu negocio. Un solo sistema.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to,
      subject: `${professionalName}, te dieron acceso a ${businessName} en re-booking`,
      html,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return { success: false, error: error.message };
  }
}

// ==================== NEW APPOINTMENT EMAIL FOR THE BARBER ====================
// Sent to the professional (not the client) whenever a new appointment is booked for
// them — by reception, by the public booking link, or via a paid deposit. This is the
// email companion to the push notification, so a barber gets word even if they never
// enabled browser notifications (Vicente's case).

interface SendBarberNewAppointmentParams {
  to: string;              // barber's email
  barberName: string;
  clientName: string;
  serviceName: string;
  date: Date;
  businessName?: string | null;
  businessLogoUrl?: string | null;
}

export async function sendBarberNewAppointment(params: SendBarberNewAppointmentParams) {
  const { to, barberName, clientName, serviceName, date, businessName, businessLogoUrl } = params;

  const dateStr = new Date(date).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = new Date(date).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #F5F7FA; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #0F8B8D, #2EC4B6); padding: 28px 24px; text-align: center;">
      <img src="https://re-booking.cl/logo-horizontal-white.png" alt="re-booking" style="height: 30px; max-width: 220px; object-fit: contain; margin-bottom: 12px;" />
      <h1 style="color: white; margin: 0; font-size: 20px;">Nueva cita agendada</h1>
      ${businessLogoUrl ? `<div style="display: inline-block; background: #ffffff; border-radius: 12px; padding: 8px 14px; margin-top: 14px;"><img src="${businessLogoUrl}" alt="${businessName || "Logo"}" style="height: 34px; max-width: 160px; object-fit: contain; display: block;" /></div>` : ""}
    </div>
    <div style="padding: 28px 24px;">
      <p style="color: #1F2937; font-size: 15px; margin: 0 0 20px;">Hola <strong>${barberName}</strong>, te agendaron una nueva cita:</p>

      <div style="background: #F5F7FA; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
        <p style="color: #0F8B8D; font-size: 30px; font-weight: bold; margin: 0 0 4px;">${timeStr}</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px; text-transform: capitalize;">${dateStr}</p>
        <div style="border-top: 1px solid #E5E7EB; padding-top: 14px;">
          <p style="color: #6B7280; font-size: 13px; margin: 4px 0;">Cliente: <strong style="color: #1F2937;">${clientName}</strong></p>
          <p style="color: #6B7280; font-size: 13px; margin: 4px 0;">Servicio: <strong style="color: #1F2937;">${serviceName}</strong></p>
        </div>
      </div>

      <a href="${appUrl}/dashboard/mi-agenda" style="display: block; text-align: center; background: #0F8B8D; color: white; padding: 13px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Ver mi agenda
      </a>
    </div>
  </div>
</body>
</html>`;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to,
      subject: `Nueva cita: ${clientName} el ${dateStr} a las ${timeStr}`,
      html,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error sending barber new-appointment email:", error);
    return { success: false, error: error.message };
  }
}

// ==================== SOLICITUD DE INSUMOS (para el administrador) ====================
// Recepcion levanta la solicitud y esto le llega por correo al administrador (o al correo que el admin eligio).
const escHtml = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface SendSupplyRequestParams {
  to: string;
  businessName: string;
  requestedBy: string;
  date: Date;
  items: Array<{ name: string; currentStock: number | null; toBuy: number; isOther?: boolean }>;
  notes?: string | null;
}

export async function sendSupplyRequestEmail(params: SendSupplyRequestParams) {
  const { to, businessName, requestedBy, date, items, notes } = params;
  const fecha = date.toLocaleDateString("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const rows = items.map((i) => `
        <tr>
          <td style="padding: 10px 8px; border-bottom: 1px solid #F3F4F6; color: #1F2937; font-size: 14px;">${escHtml(i.name)}${i.isOther ? ' <span style="color:#9CA3AF;font-size:11px;">(otro producto)</span>' : ""}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #F3F4F6; color: #6B7280; font-size: 14px; text-align: center;">${i.currentStock === null ? "-" : escHtml(i.currentStock)}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #F3F4F6; color: #0F8B8D; font-size: 14px; font-weight: 700; text-align: center;">${escHtml(i.toBuy)}</td>
        </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #F5F7FA; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #0F8B8D, #2EC4B6); padding: 28px 24px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Solicitud de insumos</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">${escHtml(businessName)} · ${escHtml(fecha)}</p>
    </div>
    <div style="padding: 24px;">
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">Solicitada por <strong style="color:#1F2937;">${escHtml(requestedBy)}</strong></p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Insumo</th>
            <th style="text-align: center; padding: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Existencias</th>
            <th style="text-align: center; padding: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">A solicitar</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
      ${notes ? `<p style="color:#6B7280;font-size:13px;margin:16px 0 0;"><strong style="color:#1F2937;">Nota:</strong> ${escHtml(notes)}</p>` : ""}
    </div>
    <div style="border-top: 1px solid #F3F4F6; padding: 14px 24px; text-align: center;">
      <p style="color: #9CA3AF; font-size: 11px; margin: 0;">re-booking · Esta solicitud también queda en tu Dashboard hasta que la borres.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to,
      subject: `Solicitud de insumos · ${businessName}`,
      html,
    });
    // Resend no lanza excepción cuando rechaza el envío: devuelve { error }.
    if (error) {
      console.error("Error sending supply request email:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error sending supply request email:", error);
    return { success: false, error: error.message };
  }
}
