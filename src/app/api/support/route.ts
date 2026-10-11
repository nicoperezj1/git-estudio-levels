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
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#9CA3AF;font-size:12px;width:130px;vertical-align:top;">${k}</td><td style="padding:6px 0;color:#1F2937;font-size:14px;">${v}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F7FA;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#0F8B8D,#2EC4B6);padding:26px 24px;">
      <p style="color:rgba(255,255,255,.85);margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Caso de soporte</p>
      <h1 style="color:#fff;margin:0;font-size:24px;">${esc(caseId)}</h1>
      <p style="color:rgba(255,255,255,.9);margin:6px 0 0;font-size:13px;">${esc(businessName || "Sin negocio")} · ${esc(when)}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 4px;color:#0F8B8D;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">${esc(area)}</p>
      <h2 style="margin:0 0 14px;color:#111827;font-size:19px;">${esc(title)}</h2>
      <div style="background:#F9FAFB;border-left:3px solid #0F8B8D;border-radius:8px;padding:14px 16px;color:#1F2937;font-size:14px;line-height:1.55;white-space:pre-wrap;">${esc(description)}</div>

      <table style="width:100%;border-collapse:collapse;margin-top:20px;border-top:1px solid #F3F4F6;">
        ${row("Quién", `${esc(userName || "-")} <span style="color:#9CA3AF;">(${esc(role || "-")})</span>`)}
        ${row("Negocio", esc(businessName || "-"))}
        ${row("WhatsApp", `<a href="${esc(waLink)}" style="color:#0F8B8D;font-weight:700;text-decoration:none;">${esc(phone)}</a>`)}
        ${row("Correo", esc(userEmail || "-"))}
        ${row("Pantalla", esc(pageUrl || "-"))}
        ${row("Dispositivo", `<span style="font-size:12px;color:#6B7280;">${esc(userAgent || "-")}</span>`)}
        ${row("Capturas", files.length ? `${files.length} adjunta${files.length > 1 ? "s" : ""} (abajo)` : "Sin capturas")}
      </table>
    </div>
    <div style="border-top:1px solid #F3F4F6;padding:14px 24px;text-align:center;">
      <p style="color:#9CA3AF;font-size:11px;margin:0;">Compromiso: responder en menos de 48 horas por WhatsApp.</p>
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
