import { redirect } from "next/navigation";

// Compatibilidad: links antiguos re-booking.cl/b/<negocio>/<profesional> -> link corto.
export default function LegacyBarberLink({
  params,
}: {
  params: { slug: string; barber: string };
}) {
  redirect(`/${params.slug}/${params.barber}`);
}
