"use client";

import { useEffect, useState } from "react";
import { Clock, Globe, MapPin, MessageCircle, Navigation, Phone, Star } from "lucide-react";

export interface BusinessHour { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }
export interface BusinessInfo {
  name: string;
  logo_url?: string | null;
  banner_url?: string | null;
  description?: string | null;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  google_maps_url?: string | null;
  google_rating?: number | null;
  google_reviews_count?: number | null;
  booking_window_days?: number | null;
  booking_view_mode?: "time" | "professional" | "both";
  booking_show_profile_direct?: boolean;
  hours?: BusinessHour[];
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hhmm = (t?: string | null) => (t || "").slice(0, 5);

// "Abierto ahora" según la hora de Chile (los negocios son de Chile).
function openNow(hours: BusinessHour[] | undefined): boolean | null {
  if (!hours || hours.length === 0) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value || "");
    const now = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
    const today = hours.find((h) => h.day_of_week === wd);
    if (!today || today.is_closed || !today.open_time || !today.close_time) return false;
    return now >= hhmm(today.open_time) && now < hhmm(today.close_time);
  } catch { return null; }
}

export default function BusinessProfile({ info }: { info: BusinessInfo }) {
  const [showHours, setShowHours] = useState(false);
  const [readMore, setReadMore] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => { setOpen(openNow(info.hours)); }, [info.hours]);

  const mapsLink = info.google_maps_url || (info.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.name} ${info.address}`)}` : null);
  const wa = info.phone ? info.phone.replace(/\D/g, "") : "";
  const website = info.website ? (/^https?:\/\//i.test(info.website) ? info.website : `https://${info.website}`) : null;
  const hasRating = typeof info.google_rating === "number" && info.google_rating > 0;
  const long = (info.description || "").length > 220;
  const hasDetails = !!(info.address || website || wa || (info.hours && info.hours.length));

  return (
    <div className="mb-8 space-y-4">
      {info.banner_url && (
        <div className="overflow-hidden rounded-3xl bg-gray-100 shadow-sm">
          <img src={info.banner_url} alt={info.name} className="h-40 w-full object-cover sm:h-56" />
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className={`flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm sm:h-24 sm:w-24 ${info.banner_url ? "relative z-10 -mt-12 ml-2 ring-4 ring-brand-light" : ""}`}>
          {info.logo_url ? <img src={info.logo_url} alt={info.name} className="max-h-full max-w-full object-contain" /> : (
            <span className="text-xl font-bold text-brand-blue">{info.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className={`min-w-0 flex-1 ${info.banner_url ? "pt-1" : ""}`}>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{info.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {open !== null && (
              <span className="flex items-center gap-1.5 text-brand-gray">
                <span className={`h-2 w-2 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} />
                {open ? "Abierto ahora" : "Cerrado ahora"}
              </span>
            )}
            {hasRating && (
              <a href={info.google_maps_url || undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {info.google_rating!.toFixed(1)}
                {info.google_reviews_count ? <span className="font-normal text-brand-gray">({info.google_reviews_count})</span> : null}
              </a>
            )}
          </div>
          {info.description && (
            <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed text-brand-gray ${!readMore && long ? "line-clamp-3" : ""}`}>{info.description}</p>
          )}
          {info.description && long && (
            <button onClick={() => setReadMore((v) => !v)} className="mt-1 text-sm font-semibold underline">{readMore ? "Leer menos" : "Leer más"}</button>
          )}
        </div>
      </div>

      {hasDetails && (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 text-sm shadow-sm sm:p-5">
          {info.address && (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p>{info.address}</p>
                {mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-brand-blue px-3.5 py-2 text-xs font-bold text-white hover:brightness-110">
                    <Navigation className="h-3.5 w-3.5" /> Cómo llegar
                  </a>
                )}
              </div>
            </div>
          )}
          {info.hours && info.hours.length > 0 && (
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <button onClick={() => setShowHours((v) => !v)} className="font-medium underline">{showHours ? "Ocultar horario" : "Ver horario"}</button>
                {showHours && (
                  <ul className="mt-2 space-y-1 text-brand-gray">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const h = info.hours!.find((x) => x.day_of_week === d);
                      return (
                        <li key={d} className="flex justify-between gap-4">
                          <span>{DAYS[d]}</span>
                          <span className="tabular-nums">{!h || h.is_closed ? "Cerrado" : `${hhmm(h.open_time)} – ${hhmm(h.close_time)}`}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
          {website && (
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
              <a href={website} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium underline">{info.website}</a>
            </div>
          )}
          {wa && (
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">¡Contáctanos por WhatsApp!</a>
            </div>
          )}
          {!wa && info.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
              <span>{info.phone}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
