"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { compressImage } from "@/lib/image-compress";
import { Panel, inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

type ViewMode = "time" | "professional" | "both";

const VIEW_OPTIONS: { value: ViewMode; title: string; desc: string }[] = [
  { value: "time", title: "Por horario", desc: "El cliente ve primero el día y la hora más cercana disponible." },
  { value: "professional", title: "Por profesional", desc: "El cliente elige primero con quién se atiende (como hoy)." },
  { value: "both", title: "Ambas", desc: "El cliente elige con una pestaña cómo quiere reservar." },
];

export default function PreferenciasReservasPage() {
  const { showToast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [rating, setRating] = useState("");
  const [reviews, setReviews] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("professional");
  const [showProfileDirect, setShowProfileDirect] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const tq = tenant?.id ? `?tenantId=${tenant.id}` : "";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/booking-preferences${tq}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d.error) return;
        setLogoUrl(d.logo_url || null);
        setBannerUrl(d.banner_url || null);
        setDescription(d.description || "");
        setMapsUrl(d.google_maps_url || "");
        setRating(d.google_rating != null ? String(d.google_rating) : "");
        setReviews(d.google_reviews_count != null ? String(d.google_reviews_count) : "");
        setViewMode((d.booking_view_mode as ViewMode) || "professional");
        setShowProfileDirect(!!d.booking_show_profile_direct);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const upload = async (kind: "logo" | "banner", e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;
    if (!original.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(original.name)) {
      showToast("El archivo debe ser una imagen (JPG, PNG, WEBP)", "error");
      return;
    }
    setUploading(kind);
    try {
      const file = await compressImage(original, { maxBytes: kind === "banner" ? 7 * 1024 * 1024 : 5 * 1024 * 1024 });
      const form = new FormData();
      form.append("file", file);
      if (tenant?.id) form.append("tenantId", tenant.id);
      const res = await fetch(kind === "logo" ? "/api/settings/logo" : "/api/settings/banner", { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "No se pudo subir la imagen");
      kind === "logo" ? setLogoUrl(result.url) : setBannerUrl(result.url);
      showToast(kind === "logo" ? "Logo actualizado" : "Imagen del negocio actualizada", "success");
    } catch (err: any) {
      showToast(err.message || "Error al subir la imagen", "error");
    } finally {
      setUploading(null);
    }
  };

  const remove = async (kind: "logo" | "banner") => {
    const res = await fetch(`/api/settings/${kind}${tq}`, { method: "DELETE" });
    if (!res.ok) { showToast("No se pudo quitar la imagen", "error"); return; }
    kind === "logo" ? setLogoUrl(null) : setBannerUrl(null);
    showToast("Imagen eliminada", "success");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/booking-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant?.id,
          description,
          google_maps_url: mapsUrl,
          google_rating: rating,
          google_reviews_count: reviews,
          booking_view_mode: viewMode,
          booking_show_profile_direct: showProfileDirect,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "No se pudo guardar");
      showToast("Preferencias guardadas", "success");
    } catch (err: any) {
      showToast(err.message || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-brand-gray">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:space-y-6 md:p-6 animate-fade-in">
      <div>
        <Link href="/dashboard/configuracion" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-gray hover:text-brand-dark">
          <ArrowLeft className="h-4 w-4" /> Configuración
        </Link>
        <h1 className="text-xl font-bold text-brand-dark md:text-2xl">Preferencias de reservas</h1>
        <p className="text-sm text-brand-gray">Cómo se ve tu página de reservas para los clientes.</p>
      </div>

      <Panel title="Imágenes" subtitle="El logo y la imagen del negocio aparecen arriba en tu página de reservas">
        <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-gray">Logo del negocio</p>
            <button onClick={() => logoInput.current?.click()} disabled={uploading === "logo"}
              className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-white hover:border-brand-blue">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-1" /> : <ImagePlus className="h-6 w-6 text-brand-gray" />}
            </button>
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload("logo", e)} />
            {uploading === "logo" && <p className="mt-1 text-xs text-brand-gray">Subiendo…</p>}
            {logoUrl && <button onClick={() => remove("logo")} className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:underline"><Trash2 className="h-3 w-3" /> Quitar</button>}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-gray">Imagen del negocio (banner)</p>
            <button onClick={() => bannerInput.current?.click()} disabled={uploading === "banner"}
              className="flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-white hover:border-brand-blue">
              {bannerUrl ? <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" /> : (
                <span className="flex flex-col items-center gap-1 text-xs text-brand-gray"><ImagePlus className="h-6 w-6" /> Sube una foto horizontal de tu local</span>
              )}
            </button>
            <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload("banner", e)} />
            {uploading === "banner" && <p className="mt-1 text-xs text-brand-gray">Subiendo…</p>}
            {bannerUrl && <button onClick={() => remove("banner")} className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:underline"><Trash2 className="h-3 w-3" /> Quitar</button>}
          </div>
        </div>
      </Panel>

      <Panel title="Presentación" subtitle="Un texto corto sobre tu negocio (opcional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={800}
          placeholder="Ej: Barbería en el centro de La Serena. Cortes clásicos y modernos, arreglo de barba y más."
          className={`${inputClass} resize-y`} />
        <p className="mt-1 text-right text-[11px] text-brand-gray">{description.length}/800</p>
        <p className="mt-2 text-xs text-brand-gray">La dirección, el teléfono (WhatsApp) y la web se toman de <Link href="/dashboard/configuracion" className="underline">Datos del negocio</Link>.</p>
      </Panel>

      <Panel title="Google Maps y reseñas" subtitle="El botón «Cómo llegar» usa este link. Las estrellas se escriben a mano (el sistema no las lee de Google).">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray">Link de Google Maps</label>
            <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-gray">Estrellas (0 a 5)</label>
              <input value={rating} onChange={(e) => setRating(e.target.value)} inputMode="decimal" placeholder="4.9" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-gray">Cantidad de reseñas</label>
              <input value={reviews} onChange={(e) => setReviews(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="106" className={inputClass} />
            </div>
          </div>
          {mapsUrl && /^https?:\/\//i.test(mapsUrl) && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-blue underline">Probar el link <ExternalLink className="h-3 w-3" /></a>
          )}
        </div>
      </Panel>

      <Panel title="Tipo de visualización para el cliente" subtitle="Cómo empieza a reservar quien entra a tu link">
        <div className="grid gap-2 sm:grid-cols-3">
          {VIEW_OPTIONS.map((o) => (
            <button key={o.value} onClick={() => setViewMode(o.value)} type="button"
              className={`rounded-2xl border p-3.5 text-left transition ${viewMode === o.value ? "border-brand-blue bg-brand-blue/5 ring-4 ring-brand-blue/10" : "border-gray-200 bg-white hover:border-brand-blue/40"}`}>
              <p className="text-sm font-bold text-brand-dark">{o.title}</p>
              <p className="mt-1 text-xs text-brand-gray">{o.desc}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Presentación en links directos" subtitle="Para quien entra por el link de un profesional, o si tu negocio tiene un solo profesional">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={showProfileDirect} onChange={(e) => setShowProfileDirect(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="block text-sm font-bold text-brand-dark">Mostrar la presentación de mi negocio antes de los servicios</span>
            <span className="mt-1 block text-xs text-brand-gray">Aparece el banner, la descripción, cómo llegar y el horario arriba de la lista de servicios. Apagado, el cliente va directo a los servicios.</span>
          </span>
        </label>
      </Panel>

      <div className="flex flex-wrap justify-end gap-2">
        {tenant?.slug && <a href={`/booking?tenant=${tenant.slug}`} target="_blank" rel="noopener noreferrer" className={ghostButton}>Ver mi página <ExternalLink className="h-4 w-4" /></a>}
        <button onClick={save} disabled={saving} className={primaryButton}>{saving ? "Guardando…" : "Guardar preferencias"}</button>
      </div>
    </div>
  );
}
