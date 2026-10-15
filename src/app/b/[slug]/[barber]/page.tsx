import { redirect } from "next/navigation";

// Compatibilidad: links antiguos re-booking.cl/b/<negocio>/<profesional> -> link corto.
// Se conservan los parametros del link (utm_*, fbclid) para no perder el origen de la reserva.
export default function LegacyBarberLink({
  params,
  searchParams,
}: {
  params: { slug: string; barber: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) {
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string") qs.set(k, val);
  }
  const rest = qs.toString();
  redirect(`/${params.slug}/${params.barber}${rest ? `?${rest}` : ""}`);
}
