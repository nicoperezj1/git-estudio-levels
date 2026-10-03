import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ProMonth } from "@/lib/ledger";

// Recibo en PDF por profesional y mes (Arriendo o Comision). Verde = lo que suma al profesional, rojo = lo que
// le descuenta. Es un documento de apoyo del negocio: no reemplaza una liquidacion de sueldo ni una boleta.

const GREEN = rgb(0.06, 0.6, 0.34);
const RED = rgb(0.84, 0.2, 0.2);
const DARK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.88, 0.9, 0.92);

// Helvetica (WinAnsi) no dibuja cualquier caracter: se cambian los que no existen para que nunca falle.
const safe = (s: string) =>
  String(s ?? "").replace(/[−–—]/g, "-").replace(/×/g, "x").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const clp = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

export async function buildReceiptPdf(o: {
  businessName: string;
  logo?: Uint8Array | null;
  pro: ProMonth;
  monthLabel: string; // "Septiembre 2026"
  issuedAt?: Date;
}): Promise<Uint8Array> {
  const { pro } = o;
  const rental = pro.mode === "rental";
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg: PDFImage | null = null;
  if (o.logo && o.logo.length > 8) {
    try {
      const png = o.logo[0] === 0x89 && o.logo[1] === 0x50;
      const jpg = o.logo[0] === 0xff && o.logo[1] === 0xd8;
      if (png) logoImg = await pdf.embedPng(o.logo);
      else if (jpg) logoImg = await pdf.embedJpg(o.logo);
    } catch { logoImg = null; }
  }

  const W = 595.28, H = 841.89, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color = DARK) =>
    page.drawText(safe(t), { x, y: yy, size, font: f, color });
  const textRight = (t: string, xr: number, yy: number, size: number, f: PDFFont = font, color = DARK) =>
    page.drawText(safe(t), { x: xr - f.widthOfTextAtSize(safe(t), size), y: yy, size, font: f, color });
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.7, color: LINE });
  const ensure = (need: number) => {
    if (y - need < M + 60) { page = pdf.addPage([W, H]); y = H - M; }
  };

  // Encabezado: logo + negocio a la izquierda, tipo de recibo a la derecha.
  let textX = M;
  if (logoImg) {
    const maxH = 46, scale = Math.min(maxH / logoImg.height, 140 / logoImg.width);
    const w = logoImg.width * scale, h = logoImg.height * scale;
    page.drawImage(logoImg, { x: M, y: y - h, width: w, height: h });
    textX = M + w + 14;
  }
  text(o.businessName, textX, y - 18, 16, bold);
  text("Recibo del profesional", textX, y - 36, 10, font, GRAY);
  textRight(rental ? "RECIBO DE ARRIENDO" : "RECIBO DE COMISIÓN", W - M, y - 18, 11, bold, DARK);
  textRight(o.monthLabel, W - M, y - 36, 10, font, GRAY);
  y -= 66;
  rule(y);
  y -= 26;

  text("Profesional", M, y, 9, font, GRAY);
  text(pro.name, M, y - 15, 14, bold);
  const issued = (o.issuedAt || new Date()).toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
  textRight("Emitido el", W - M, y, 9, font, GRAY);
  textRight(issued, W - M, y - 15, 11, font, DARK);
  y -= 46;

  // Tabla de conceptos.
  text("CONCEPTO", M, y, 8, bold, GRAY);
  textRight("MONTO", W - M, y, 8, bold, GRAY);
  y -= 8;
  rule(y);
  y -= 20;

  const row = (label: string, amountText: string, color: ReturnType<typeof rgb>, sub?: string) => {
    ensure(sub ? 34 : 24);
    text(label, M, y, 11, font, DARK);
    textRight(amountText, W - M, y, 11, bold, color);
    if (sub) { y -= 12; text(sub, M, y, 8, font, GRAY); }
    y -= 10;
    rule(y);
    y -= 16;
  };

  // En arriendo el valor base es lo que el profesional debe (descuenta); en comision es lo que gana (suma).
  row(pro.baseLabel, `${rental ? "-" : "+"}${clp(pro.base)}`, rental ? RED : GREEN);
  if (pro.lines.length === 0) {
    ensure(24);
    text("Sin otros movimientos este mes.", M, y, 9, font, GRAY);
    y -= 24;
  }
  for (const l of pro.lines) {
    const good = l.effect === 1;
    row(l.label, `${good ? "+" : "-"}${clp(l.amount)}`, good ? GREEN : RED, l.reason ? `${l.reason}${l.by ? ` - ${l.by}` : ""}` : undefined);
  }

  // Total y estado del pago.
  ensure(120);
  y -= 6;
  const owed = pro.total < 0;
  // Un total NEGATIVO significa cosas distintas: en comision el profesional se llevo mas de lo que gano (el debe al
  // negocio); en arriendo los descuentos superan lo que debia pagar (el negocio le debe a el).
  const totalLabel = owed
    ? (rental ? "El negocio le debe al profesional" : "El profesional le debe al negocio")
    : rental ? "Total a cobrar al profesional" : "Total a pagar al profesional";
  text(totalLabel, M, y, 12, bold, DARK);
  textRight(clp(Math.abs(pro.total)), W - M, y, 16, bold, DARK);
  y -= 24;
  text(rental ? "Cobrado" : "Pagado", M, y, 10, font, GRAY);
  textRight(clp(pro.paid), W - M, y, 10, font, DARK);
  y -= 16;
  text("Pendiente", M, y, 10, font, GRAY);
  textRight(clp(pro.pending), W - M, y, 10, bold, pro.pending > 0 ? RED : DARK);
  y -= 16;
  if (pro.paidAt) {
    text(`Último registro: ${new Date(pro.paidAt).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}${pro.paidBy ? ` - ${pro.paidBy}` : ""}`, M, y, 8, font, GRAY);
    y -= 14;
  }

  // Firmas y nota.
  ensure(110);
  y -= 50;
  page.drawLine({ start: { x: M, y }, end: { x: M + 190, y }, thickness: 0.7, color: GRAY });
  page.drawLine({ start: { x: W - M - 190, y }, end: { x: W - M, y }, thickness: 0.7, color: GRAY });
  text("Firma profesional", M, y - 12, 8, font, GRAY);
  textRight("Firma administración", W - M, y - 12, 8, font, GRAY);
  text("Verde: suma al profesional. Rojo: descuenta al profesional. Documento de apoyo generado con re-booking.", M, M - 8, 7, font, GRAY);

  return pdf.save();
}
