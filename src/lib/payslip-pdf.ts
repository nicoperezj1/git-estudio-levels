import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { PayslipResult } from "@/lib/payroll";

// Liquidacion de sueldo en PDF con logo del negocio. Verde = lo que suma al trabajador, rojo = lo que descuenta.
// HERRAMIENTA DE APOYO: valida con tu contador antes de firmar o declarar.

const GREEN = rgb(0.06, 0.6, 0.34);
const RED = rgb(0.84, 0.2, 0.2);
const DARK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.88, 0.9, 0.92);

const safe = (s: string) =>
  String(s ?? "").replace(/[−–—]/g, "-").replace(/×/g, "x").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const clp = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

export async function buildPayslipPdf(o: {
  businessName: string; logo?: Uint8Array | null; workerName: string; monthLabel: string; result: PayslipResult;
  contractLabel: string; status: string; issuedAt?: Date;
}): Promise<Uint8Array> {
  const { result: R } = o;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg: PDFImage | null = null;
  if (o.logo && o.logo.length > 8) {
    try {
      if (o.logo[0] === 0x89 && o.logo[1] === 0x50) logoImg = await pdf.embedPng(o.logo);
      else if (o.logo[0] === 0xff && o.logo[1] === 0xd8) logoImg = await pdf.embedJpg(o.logo);
    } catch { logoImg = null; }
  }

  const W = 595.28, H = 841.89, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color = DARK) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
  const textRight = (t: string, xr: number, yy: number, size: number, f: PDFFont = font, color = DARK) =>
    page.drawText(safe(t), { x: xr - f.widthOfTextAtSize(safe(t), size), y: yy, size, font: f, color });
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.7, color: LINE });
  const ensure = (need: number) => { if (y - need < M + 50) { page = pdf.addPage([W, H]); y = H - M; } };

  let textX = M;
  if (logoImg) {
    const maxH = 46, scale = Math.min(maxH / logoImg.height, 140 / logoImg.width);
    const w = logoImg.width * scale, h = logoImg.height * scale;
    page.drawImage(logoImg, { x: M, y: y - h, width: w, height: h });
    textX = M + w + 14;
  }
  text(o.businessName, textX, y - 18, 16, bold);
  text("Liquidación de sueldo", textX, y - 36, 10, font, GRAY);
  textRight("LIQUIDACIÓN DE SUELDO", W - M, y - 18, 11, bold, DARK);
  textRight(o.monthLabel, W - M, y - 36, 10, font, GRAY);
  y -= 66; rule(y); y -= 26;

  text("Trabajador", M, y, 9, font, GRAY);
  text(o.workerName, M, y - 15, 14, bold);
  textRight("Contrato", W - M, y, 9, font, GRAY);
  textRight(o.contractLabel, W - M, y - 15, 11, font, DARK);
  y -= 34;
  text(`Días pagados: ${R.paidDays} de 30${o.status === "draft" ? "  ·  BORRADOR" : ""}`, M, y, 9, font, GRAY);
  textRight(`Emitida el ${(o.issuedAt || new Date()).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`, W - M, y, 9, font, GRAY);
  y -= 22;

  const section = (title: string) => { ensure(40); text(title, M, y, 8, bold, GRAY); y -= 8; rule(y); y -= 18; };
  const row = (label: string, amountText: string, color: ReturnType<typeof rgb>, tag?: string) => {
    ensure(22);
    text(label, M, y, 10.5, font, DARK);
    if (tag) text(tag, M + 4 + font.widthOfTextAtSize(safe(label), 10.5), y, 7.5, font, GRAY);
    textRight(amountText, W - M, y, 10.5, bold, color);
    y -= 8; rule(y); y -= 14;
  };

  section("HABERES");
  for (const h of R.lines.haberes) row(h.label, `+${clp(h.amount)}`, GREEN, h.imponible ? "  (imponible)" : "  (no imponible)");
  row("Total haberes", clp(R.totalHaberes), DARK);

  section("DESCUENTOS");
  for (const d of R.lines.descuentos) row(d.label, `-${clp(d.amount)}`, RED);
  row("Total descuentos", `-${clp(R.totalDescuentos)}`, DARK);

  ensure(60);
  y -= 4;
  text("LÍQUIDO A PAGAR", M, y, 13, bold, DARK);
  textRight(clp(R.net), W - M, y, 18, bold, R.net > 0 ? GREEN : RED);
  y -= 30;

  section("COSTO PARA EL EMPLEADOR (informativo)");
  row("Aportes del empleador (SIS, cesantía, mutual, reforma)", clp(R.employer.total), GRAY);
  row("Costo total empresa", clp(R.totalCost), DARK);

  if (R.warnings.length) {
    ensure(30 + R.warnings.length * 12);
    y -= 4;
    for (const w of R.warnings) { text(`${w.level === "error" ? "ERROR" : "Aviso"}: ${w.text}`, M, y, 8, font, w.level === "error" ? RED : GRAY); y -= 12; }
  }

  ensure(60);
  y -= 36;
  page.drawLine({ start: { x: M, y }, end: { x: M + 190, y }, thickness: 0.7, color: GRAY });
  page.drawLine({ start: { x: W - M - 190, y }, end: { x: W - M, y }, thickness: 0.7, color: GRAY });
  text("Firma trabajador", M, y - 12, 8, font, GRAY);
  textRight("Firma empleador", W - M, y - 12, 8, font, GRAY);
  text("Herramienta de apoyo generada con re-booking. Valida con tu contador antes de firmar o declarar.", M, M - 8, 7, font, GRAY);
  return pdf.save();
}
