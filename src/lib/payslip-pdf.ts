import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { PayslipResult, PaymentInfo } from "@/lib/payroll";

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
  employer?: { rut?: string | null; address?: string | null };
  worker?: { rut?: string | null; position?: string | null; costCenter?: string | null; hireDate?: string | null; afp?: string | null; health?: string | null };
  payment?: PaymentInfo;
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
  const ensure = (need: number) => { if (y - need < M + 36) { page = pdf.addPage([W, H]); y = H - M; } };

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

  // Identificacion (secciones 1 y 2 de la plantilla).
  // Cada dato se recorta para no salirse de su columna (la ultima llega hasta el margen derecho).
  const kv = (label: string, value: string | null | undefined, x: number, yy: number) => {
    text(label, x, yy, 7.5, font, GRAY);
    let v = value && String(value).trim() ? safe(String(value)) : "-";
    const maxW = (x >= M + 380 ? W - M : x >= M + 250 ? M + 380 : x >= M + 120 ? M + 250 : M + 260) - x - 8;
    while (v.length > 3 && font.widthOfTextAtSize(v, 10) > maxW) v = v.slice(0, -2);
    text(v, x, yy - 11, 10, font, DARK);
  };
  text("EMPLEADOR", M, y, 8, bold, GRAY);
  y -= 16;
  kv("Razón social / nombre", o.businessName, M, y);
  kv("RUT empresa", o.employer?.rut, M + 260, y);
  kv("Dirección", o.employer?.address, M + 390, y);
  y -= 30;
  text("TRABAJADOR", M, y, 8, bold, GRAY);
  y -= 16;
  kv("Nombre completo", o.workerName, M, y);
  kv("RUT", o.worker?.rut, M + 260, y);
  kv("Cargo", o.worker?.position, M + 390, y);
  y -= 28;
  kv("Fecha de ingreso", o.worker?.hireDate ? new Date(`${o.worker.hireDate}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC" }) : "", M, y);
  kv("Tipo de contrato", o.contractLabel, M + 130, y);
  kv("AFP", o.worker?.afp, M + 260, y);
  kv("Salud", o.worker?.health, M + 390, y);
  y -= 28;
  if (o.worker?.costCenter) { kv("Centro de costo", o.worker.costCenter, M, y); y -= 28; }
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

  const pay = o.payment;
  if (pay && (pay.date || pay.bank || pay.reference || pay.voucher || pay.notes || pay.method)) {
    ensure(90);
    y -= 6;
    text("PAGO Y CONSTANCIA", M, y, 8, bold, GRAY);
    y -= 16;
    const methodLabel = ({ transfer: "Transferencia", cash: "Efectivo", check: "Cheque", other: "Otro" } as Record<string, string>)[pay.method] || pay.method;
    kv("Forma de pago", methodLabel, M, y);
    kv("Fecha de pago", pay.date ? new Date(`${pay.date}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC" }) : "", M + 130, y);
    kv("Banco / medio", pay.bank, M + 260, y);
    kv("N° comprobante", pay.voucher, M + 390, y);
    y -= 32;
    if (pay.reference) { kv("Cuenta / referencia", pay.reference, M, y); y -= 32; }
    if (pay.notes) { text("Observaciones", M, y, 7.5, font, GRAY); text(pay.notes.slice(0, 110), M, y - 11, 9, font, DARK); y -= 30; }
  }

  ensure(60);
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: M + 190, y }, thickness: 0.7, color: GRAY });
  page.drawLine({ start: { x: W - M - 190, y }, end: { x: W - M, y }, thickness: 0.7, color: GRAY });
  text("Firma trabajador", M, y - 12, 8, font, GRAY);
  textRight("Firma empleador", W - M, y - 12, 8, font, GRAY);
  text("Herramienta de apoyo generada con re-booking. Valida con tu contador antes de firmar o declarar.", M, M - 8, 7, font, GRAY);
  return pdf.save();
}
