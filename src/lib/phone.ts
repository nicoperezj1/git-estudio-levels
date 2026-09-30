// Formato unico de telefono chileno para copiar/pegar en WhatsApp (+56...). Se usa en
// Mensajes por WhatsApp y en Retencion para que ambos entreguen los numeros igual.
export function formatPhoneCL(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("56")) return "+" + cleaned;
  if (cleaned.startsWith("9") && cleaned.length === 9) return "+56" + cleaned;
  return "+56" + cleaned;
}
