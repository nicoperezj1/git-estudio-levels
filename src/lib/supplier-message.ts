// Mensaje de cotizacion a un proveedor por WhatsApp (Fase 4). Todo sale del negocio y del administrador logueado:
// el nombre del negocio nunca va fijo en el codigo.

// Saludo segun la hora de Chile: dias 06-11, tardes 12-19, noches 20-05.
export function greetingForNow(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", hour12: false }).format(now));
  if (hour >= 6 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export interface QuoteLine { name: string; qty: number }

export function buildSupplierMessage(o: {
  adminName: string;
  businessName: string;
  items: QuoteLine[];       // productos del inventario
  newProducts: QuoteLine[]; // "¿producto nuevo?"
  now?: Date;
}): string {
  const lines = [...o.items, ...o.newProducts].filter((i) => i.name.trim() && i.qty > 0).map((i) => `- ${i.name.trim()} x ${i.qty}`);
  const admin = o.adminName.trim();
  const biz = o.businessName.trim();
  const intro = `${greetingForNow(o.now)}, un gusto en saludar por acá${admin ? `: ${admin}` : ""}${biz ? `, de ${biz}` : ""}. Escribo para solicitar una cotización con los siguientes productos:`;
  return [intro, "", ...(lines.length ? lines : ["- (agrega los productos)"]), "", "Muchas gracias, atento a su respuesta.", biz ? `- ${biz}` : ""].filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n");
}

// Celular chileno -> numero para wa.me (con codigo de pais 56).
export function toWhatsAppPhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) return null;
  return digits.startsWith("56") && digits.length >= 11 ? digits : `56${digits}`;
}

export const whatsAppUrl = (phone: string, message: string): string | null => {
  const p = toWhatsAppPhone(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(message)}` : null;
};
