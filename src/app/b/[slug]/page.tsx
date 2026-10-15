import { redirect } from "next/navigation";

// re-booking.cl/b/estudiolevels → redirects to /booking?tenant=estudiolevels
// Los parametros del link (utm_*, fbclid de los anuncios) se conservan: antes se perdian aqui y la reserva no sabia de que anuncio venia.
export default function TenantBookingRedirect({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  qs.set("tenant", params.slug);
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (k === "tenant") continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string") qs.set(k, val);
  }
  redirect(`/booking?${qs.toString()}`);
}
