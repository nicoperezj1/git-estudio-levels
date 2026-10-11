import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend-client";
import { SUPPORT_AREAS, SUPPORT_MAX_IMAGES, SUPPORT_MAX_TOTAL_BYTES, formatCaseNumber } from "@/lib/support";

export const maxDuration = 30;

// El correo de soporte vive solo aqui (o en SUPPORT_INBOX); nunca se muestra en pantalla.
const INBOX = process.env.SUPPORT_INBOX || "contactorebooking@gmail.com";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function POST(req: NextRequest) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "Inicia sesión para pedir ayuda" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 }); }

  const area = String(form.get("area") || "").trim();
  const title = String(form.get("title") || "").trim().slice(0, 120);
  const description = String(form.get("description") || "").trim().slice(0, 4000);
  const phone = String(form.get("phone") || "").trim().slice(0, 30);
  const pageUrl = String(form.get("pageUrl") || "").trim().slice(0, 300);
  const userAgent = String(form.get("userAgent") || "").trim().slice(0, 300);

  if (!(SUPPORT_AREAS as readonly string[]).includes(area)) return NextResponse.json({ error: "Elige el área del problema" }, { status: 400 });
  if (title.length < 4) return NextResponse.json({ error: "Escribe un título para el problema" }, { status: 400 });
  if (description.length < 10) return NextResponse.json({ error: "Cuéntanos qué pasó (al menos una frase)" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "Escribe un número de WhatsApp para contactarte" }, { status: 400 });

  const files = form.getAll("images").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (files.length > SUPPORT_MAX_IMAGES) return NextResponse.json({ error: `Máximo ${SUPPORT_MAX_IMAGES} capturas` }, { status: 400 });
  let total = 0;
  for (const f of files) {
    if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) return NextResponse.json({ error: "Las capturas deben ser imágenes (JPG, PNG o WebP)" }, { status: 400 });
    total += f.size;
  }
  if (total > SUPPORT_MAX_TOTAL_BYTES) return NextResponse.json({ error: "Las capturas pesan demasiado; intenta con menos o más livianas" }, { status: 413 });

  const supabase = createAdminSupabase();
  const [{ data: profile }, { data: tenant }] = await Promise.all([
    supabase.from("profiles").select("name, email").eq("id", userId).maybeSingle(),
    tenantId ? supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle() : Promise.resolve({ data: null as any }),
  ]);
  const userName = (profile as any)?.name || "";
  const userEmail = (profile as any)?.email || "";
  const businessName = (tenant as any)?.name || "";

  // Tope diario por usuario (si la tabla aun no existe, no se cuenta).
  let recent = 0;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    recent = count || 0;
  } catch { /* sin tabla */ }
  if (recent >= 15) return NextResponse.json({ error: "Ya enviaste varios casos hoy. Te contactaremos pronto." }, { status: 429 });

  // Caso numerado. Si la tabla aun no existe (migracion 107) el aviso sale igual, con un codigo de respaldo.
  let caseNumber: number | null = null;
  const { data: ticket, error: tErr } = await supabase
    .from("support_tickets")
    .insert({ tenant_id: tenantId || null, user_id: userId, user_name: userName, area, title, description, phone, page_url: pageUrl || null, attachments_count: files.length })
    .select("case_number")
    .single();
  if (!tErr) caseNumber = Number((ticket as any)?.case_number) || null;
  const caseId = formatCaseNumber(caseNumber);

  const when = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" });
  const waDigits = phone.replace(/\D/g, "");
  const waLink = `https://wa.me/${waDigits.length === 9 ? "56" + waDigits : waDigits}`;
  // Tabla de datos en dos columnas para aprovechar el ancho del correo.
  const cell = (k: string, v: string) =>
    `<td style="padding:7px 12px 7px 0;vertical-align:top;width:50%;"><div style="color:#9CA3AF;font-size:11px;text-transform:uppercase;letter-spacing:.6px;">${k}</div><div style="color:#1F2937;font-size:14px;margin-top:2px;word-break:break-word;">${v}</div></td>`;
  const pair = (a: string, b: string) => `<tr>${a}${b}</tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F7FA;margin:0;padding:12px;">
  <div style="width:100%;max-width:900px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#0F8B8D,#2EC4B6);padding:18px 24px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;">
          <div style="color:rgba(255,255,255,.85);font-size:11px;letter-spacing:1px;text-transform:uppercase;">Caso de soporte</div>
          <div style="color:#fff;font-size:26px;font-weight:800;margin-top:2px;">${esc(caseId)}</div>
        </td>
        <td style="vertical-align:middle;text-align:right;color:rgba(255,255,255,.92);font-size:13px;line-height:1.5;">
          <strong>${esc(businessName || "Sin negocio")}</strong><br/>${esc(when)}
        </td>
      </tr></table>
    </div>
    <div style="padding:20px 24px 8px;">
      <div style="color:#0F8B8D;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">${esc(area)}</div>
      <h2 style="margin:4px 0 12px;color:#111827;font-size:20px;line-height:1.3;">${esc(title)}</h2>
      <div style="background:#F9FAFB;border-left:3px solid #0F8B8D;border-radius:8px;padding:14px 16px;color:#1F2937;font-size:15px;line-height:1.55;white-space:pre-wrap;">${esc(description)}</div>
    </div>
    <div style="padding:6px 24px 18px;">
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #F3F4F6;margin-top:10px;">
        ${pair(cell("Quién", `${esc(userName || "-")} <span style="color:#9CA3AF;">(${esc(role || "-")})</span>`), cell("Negocio", esc(businessName || "-")))}
        ${pair(cell("WhatsApp", `<a href="${esc(waLink)}" style="color:#0F8B8D;font-weight:700;text-decoration:none;">${esc(phone)}</a>`), cell("Correo", esc(userEmail || "-")))}
        ${pair(cell("Pantalla", esc(pageUrl || "-")), cell("Capturas", files.length ? `${files.length} adjunta${files.length > 1 ? "s" : ""} (abajo)` : "Sin capturas"))}
        <tr><td colspan="2" style="padding:7px 0 0;"><div style="color:#9CA3AF;font-size:11px;text-transform:uppercase;letter-spacing:.6px;">Dispositivo</div><div style="color:#6B7280;font-size:12px;margin-top:2px;">${esc(userAgent || "-")}</div></td></tr>
      </table>
    </div>
    <div style="border-top:1px solid #F3F4F6;padding:10px 24px;text-align:center;">
      <span style="color:#9CA3AF;font-size:11px;">Compromiso: responder en menos de 48 horas por WhatsApp.</span>
    </div>
  </div>
</body></html>`;

  const attachments = await Promise.all(
    files.map(async (f, i) => ({
      filename: `${caseId}-captura-${i + 1}.${/png/i.test(f.type) ? "png" : /webp/i.test(f.type) ? "webp" : "jpg"}`,
      content: Buffer.from(await f.arrayBuffer()),
    }))
  );

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to: INBOX,
      reply_to: userEmail || undefined,
      subject: `[${caseId}] ${area} · ${title}${businessName ? ` · ${businessName}` : ""}`,
      html,
      attachments,
    });
    if (error) {
      console.error("support email:", error);
      return NextResponse.json({ error: "No pudimos enviar tu caso. Inténtalo de nuevo en un momento." }, { status: 502 });
    }
  } catch (e: any) {
    console.error("support email:", e?.message);
    return NextResponse.json({ error: "No pudimos enviar tu caso. Inténtalo de nuevo en un momento." }, { status: 502 });
  }

  return NextResponse.json({ success: true, caseId });
}
