// Mensaje de WhatsApp para confirmar la hora de un cliente. Lo usan el boton de WhatsApp del
// Calendario y el de Mi Agenda, para que digan exactamente lo mismo.
//
// Ejemplo:
//   Hola Matias! Te escribimos desde Estudio Levels para confirmar tu hora de Solo corte
//   Nicolas el jueves, 1 de octubre a las 10:00. Nos confirmas si asistirás? Gracias!
//
// El nombre del negocio viene siempre del negocio de quien esta logueado (nunca fijo en el
// codigo), asi cada negocio escribe con su propio nombre.

const normalize = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const firstWord = (t: string) => (t || "").trim().split(/\s+/)[0] || "";

export interface ConfirmWhatsAppInput {
  clientName?: string | null;
  phone?: string | null;
  businessName?: string | null;
  professionalName?: string | null;
  serviceNames?: string[];
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
}

export function buildConfirmWhatsAppUrl(input: ConfirmWhatsAppInput): string | null {
  const raw = String(input.phone || "").replace(/\D/g, "").replace(/^0/, "");
  if (!raw) return null;
  const phone = raw.startsWith("56") ? raw : `56${raw}`;

  const fecha = new Date(input.date + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hora = input.time?.match(/(\d{2}:\d{2})/)?.[1] || "";
  const servicio = (input.serviceNames || []).filter(Boolean).join(", ");
  const cliente = firstWord(input.clientName || "");
  const negocio = (input.businessName || "").trim();
  const profesional = (input.professionalName || "").trim();

  // Muchos servicios ya llevan el nombre del profesional ("Solo corte Nicolas"): en ese caso
  // no se repite ("... de Solo corte Nicolas con Nicolás").
  const proFirst = normalize(firstWord(profesional));
  const serviceHasPro = !!proFirst && normalize(servicio).includes(proFirst);

  const saludo = `Hola${cliente ? ` ${cliente}` : ""}!`;
  const desde = negocio ? ` Te escribimos desde ${negocio}` : " Te escribimos";
  const que = `${servicio ? ` de ${servicio}` : ""}${profesional && !serviceHasPro ? ` con ${profesional}` : ""}`;
  const cuando = `${fecha}${hora ? ` a las ${hora}` : ""}`;
  const msg = `${saludo}${desde} para confirmar tu hora${que} el ${cuando}. Nos confirmas si asistirás? Gracias!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
