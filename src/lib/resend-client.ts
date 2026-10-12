import { Resend } from "resend";

// Pie comun de todos los correos: "Powered by re-booking" con el logo chico a la izquierda.
export const POWERED_BY_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" data-rb-powered="1" style="margin:18px auto 8px auto;"><tr>
<td valign="middle" style="padding-right:6px;"><img src="https://www.re-booking.cl/logo-icon.png" alt="" width="16" height="16" style="display:block;width:16px;height:16px;border:0;" /></td>
<td valign="middle" style="font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9CA3AF;">Powered by <a href="https://www.re-booking.cl" style="color:#6B7280;text-decoration:none;font-weight:700;">re-booking</a></td>
</tr></table>`;

export function withPoweredBy(html: string): string {
  if (!html || html.includes("data-rb-powered")) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${POWERED_BY_HTML}</body>`) : html + POWERED_BY_HTML;
}

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY no configurada");
  const client = new Resend(apiKey);
  const send = client.emails.send.bind(client.emails);
  (client.emails as any).send = (payload: any, ...rest: any[]) =>
    send(payload && typeof payload.html === "string" ? { ...payload, html: withPoweredBy(payload.html) } : payload, ...rest);
  return client;
}
