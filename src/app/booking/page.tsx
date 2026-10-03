"use client";

import { useState, useEffect, useRef } from "react";
import BusinessProfile, { type BusinessInfo } from "@/components/booking/business-profile";
import TimeFirstFlow, { type TimePick } from "@/components/booking/time-first-flow";
import { formatCurrency } from "@/lib/utils";
import { SuccessMark } from "@/components/ui/empty-state";

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  imageUrl?: string | null;
}

interface Barber {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  intro_video_url: string | null;
  years_experience: number | null;
  booking_slug?: string | null;
}

type Step = "barber" | "service" | "datetime" | "details" | "confirmed";

// Online payment button on the booking confirmation screen. Off for now (clients pay
// in the shop); set to true to re-enable.
const ONLINE_PAYMENT_ON_CONFIRM = false;

export default function BookingPage() {
  const [step, setStep] = useState<Step>("barber");
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  // Cupos que quedan por hora (solo negocios de Kinesiologia con mas de 1 cliente por bloque).
  const [spots, setSpots] = useState<Record<string, number>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Selections
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [clientFound, setClientFound] = useState(false);
  const [appointmentId, setAppointmentId] = useState("");
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessSuspended, setBusinessSuspended] = useState(false);
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  // Vista de reserva: "time" (día y hora primero) o "professional" (profesional primero).
  const [viewMode, setViewMode] = useState<"time" | "professional">("professional");
  const preselectSlot = useRef<string>(""); // hora elegida en la vista por horario
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(30);
  const [depositMessage, setDepositMessage] = useState("");

  // Computed totals
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  const [closedDays, setClosedDays] = useState<number[]>([]);
  // Fechas puntuales en que el profesional esta de vacaciones.
  const [closedDates, setClosedDates] = useState<string[]>([]);
  // true cuando el cliente uso "Primer profesional disponible" (la cita se marca como asignada sola).
  const [autoAssigned, setAutoAssigned] = useState(false);
  const [closedDaysLoaded, setClosedDaysLoaded] = useState(false);
  const [tenantSlugState, setTenantSlugState] = useState<string>("");

  useEffect(() => {
    // Get tenant slug from URL params
    const urlParams = new URLSearchParams(window.location.search);
    // Link corto /<negocio>/<profesional>: negocio y profesional vienen de la ruta.
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const pathTenant = pathParts.length === 2 && pathParts[0] !== "booking" ? decodeURIComponent(pathParts[0]) : null;
    const pathProf = pathTenant ? decodeURIComponent(pathParts[1]) : null;
    const tenantSlug = urlParams.get("tenant") || urlParams.get("branch") || pathTenant;
    if (tenantSlug) setTenantSlugState(tenantSlug);
    const barberSlug = urlParams.get("profesional") || urlParams.get("barber");
    const profSlugParam = urlParams.get("prof") || pathProf; // preferred: unique readable booking_slug
    const barberIdParam = urlParams.get("barberId"); // also unambiguous (uuid)
    const barberUrl = tenantSlug ? `/api/public/barbers?branch=${tenantSlug}` : "/api/public/barbers";

    // Fetch business info if on subdomain
    if (tenantSlug) {
      fetch(`/api/public/business-info?slug=${tenantSlug}`).then((r) => r.json()).then((data) => {
        if (data.name) {
          setBusinessName(data.name); setBusinessInfo(data);
          if (data.suspended) setBusinessSuspended(true);
          if (data.booking_view_mode === "time") setViewMode("time");
        }
        if (data.logo_url) setBusinessLogoUrl(data.logo_url);
        // Fetch deposit settings for this tenant
        if (data.id) {
          fetch(`/api/settings/deposit?tenantId=${data.id}`).then((r) => r.json()).then((dep) => {
            if (dep.deposit_enabled) {
              setDepositRequired(true);
              setDepositPercentage(dep.deposit_percentage || 30);
              setDepositMessage(dep.deposit_message || "");
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    const nameToSlug = (n: string) =>
      (n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Personal link path: if we have a specific barber (by id), resolve that barber
    // DIRECTLY — don't depend on the tenant-filtered list matching. This is what makes
    // the professional's own link reliably open THEIR services instead of falling back
    // to "selecciona un profesional" or the wrong person.
    if (barberIdParam) {
      fetch(`/api/public/barber?id=${barberIdParam}`).then((r) => r.json()).then((res) => {
        if (res?.barber) {
          setSelectedBarber(res.barber);
          setStep("service");
          if (res.tenant?.logo_url) setBusinessLogoUrl(res.tenant.logo_url);
          if (res.tenant?.name) setBusinessName(res.tenant.name);
        }
      }).catch(() => {});
    }

    fetch(barberUrl).then((r) => r.json()).then((data) => {
      setBarbers(data);
      // If the link didn't carry a barberId, auto-select from the list by:
      //   1. ?prof=<booking_slug or name-slug>
      //   2. ?profesional=<name> (legacy)
      if (!barberIdParam && data.length > 0) {
        let match: any = null;
        if (profSlugParam) {
          match = data.find((b: any) => b.booking_slug === profSlugParam) ||
                  data.find((b: any) => nameToSlug(b.name) === profSlugParam);
        }
        if (!match && barberSlug) {
          match = data.find((b: any) => nameToSlug(b.name) === barberSlug);
        }
        if (match) {
          setSelectedBarber(match);
          setStep("service");
        }
      }
    });
  }, []);

  // Closed days come from the SELECTED professional's schedule (their own days, falling
  // back to their business's hours) — not a global business-hours list. That list had no
  // tenant for anonymous clients and hid Sunday for everyone, so a professional who only
  // works Sundays never showed that day.
  useEffect(() => {
    if (!selectedBarber) return;
    setClosedDaysLoaded(false);
    fetch(`/api/public/barber-days?barberId=${selectedBarber.id}`)
      .then((r) => r.json())
      .then((data) => { setClosedDays(Array.isArray(data?.closedDays) ? data.closedDays : []); setClosedDates(Array.isArray(data?.closedDates) ? data.closedDates : []); })
      .catch(() => setClosedDays([]))
      .finally(() => setClosedDaysLoaded(true));
  }, [selectedBarber]);

  // Load services when barber is selected (with custom prices)
  useEffect(() => {
    if (selectedBarber) {
      fetch(`/api/public/barber-services?barberId=${selectedBarber.id}`)
        .then((r) => r.json())
        .then((data) => setServices(Array.isArray(data) ? data : []));
    }
  }, [selectedBarber]);

  // Default to TODAY (not tomorrow). If today happens to be a day the business is
  // closed, fall back to the next open day. Runs once closedDays has loaded so we
  // don't default into a closed day by mistake.
  useEffect(() => {
    if (!closedDaysLoaded) return; // wait for real data
    if (selectedDate) {
      // Keep the user's pick unless it falls on a day this professional doesn't attend.
      const [y, m, dd] = selectedDate.split("-").map(Number);
      if (!closedDays.includes(new Date(y, m - 1, dd).getDay()) && !closedDates.includes(selectedDate)) return;
    }
    let d = new Date();
    for (let i = 0; i < (businessInfo?.booking_window_days ?? 60); i++) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!closedDays.includes(d.getDay()) && !closedDates.includes(ds)) {
        // Local date string, not UTC (toISOString shifted "today" to tomorrow in the
        // evening in Chile, which is exactly the "no aparece el dia actual" report).
        setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        return;
      }
      d.setDate(d.getDate() + 1);
    }
  }, [closedDaysLoaded, closedDays, closedDates]);

  // Fetch slots when barber or date changes
  useEffect(() => {
    if (selectedBarber && selectedDate && selectedServices.length > 0) {
      setLoadingSlots(true);
      setSelectedSlot(preselectSlot.current);
      fetch(
        `/api/public/availability?barberId=${selectedBarber.id}&date=${selectedDate}&duration=${totalDuration}`
      )
        .then((r) => r.json())
        .then((data) => { setSlots(data.slots || []); setSpots(data.spots || {}); })
        .finally(() => { setLoadingSlots(false); preselectSlot.current = ""; });
    }
  }, [selectedBarber, selectedDate, selectedServices]);

  // Con cupos por bloque otras personas pueden tomar un cupo mientras miras la lista: se refresca
  // sola cada 15 s (solo cuando el negocio usa cupos) y si tu hora se llena, se te avisa.
  const hasSpots = Object.keys(spots).length > 0;
  useEffect(() => {
    if (!hasSpots || step !== "datetime" || !selectedBarber || !selectedDate || selectedServices.length === 0) return;
    const id = setInterval(() => {
      fetch(`/api/public/availability?barberId=${selectedBarber.id}&date=${selectedDate}&duration=${totalDuration}`)
        .then((r) => r.json())
        .then((data) => {
          const fresh: string[] = data.slots || [];
          setSlots(fresh);
          setSpots(data.spots || {});
          setSelectedSlot((cur) => {
            if (cur && !fresh.includes(cur)) { setError("Esa hora se acaba de llenar. Elige otra."); return ""; }
            return cur;
          });
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [hasSpots, step, selectedBarber, selectedDate, selectedServices, totalDuration]);

  const handleBook = async () => {
    setError("");
    setSubmitting(true);

    // If deposit is required, create MP checkout preference and redirect
    if (depositRequired) {
      const depositRes = await fetch("/api/booking/create-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceIds: selectedServices.map((s) => s.id),
          barberId: selectedBarber!.id,
          date: selectedDate,
          startTime: selectedSlot,
          clientName,
          clientEmail: clientEmail || null,
          clientPhone: clientPhone || null,
          notes: notes || null,
          totalPrice,
        }),
      });

      const depositData = await depositRes.json();
      setSubmitting(false);

      if (depositData.checkoutUrl) {
        // Redirect to MercadoPago Checkout
        window.location.href = depositData.checkoutUrl;
        return;
      } else {
        setError(depositData.error || "Error al crear link de pago");
        return;
      }
    }

    // Normal flow (no deposit required)
    const res = await fetch("/api/public/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceIds: selectedServices.map((s) => s.id),
        barberId: selectedBarber!.id,
        date: selectedDate,
        startTime: selectedSlot,
        clientName,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        notes: notes || null,
        autoAssigned,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (res.ok) {
      setAppointmentId(data.appointmentId || "");
      setStep("confirmed");
    } else {
      setError(data.error || "Error al agendar. Intenta de nuevo.");
    }
  };

  // Generate date options (next 14 days, excluding past)
  // Use a LOCAL date string (not toISOString, which is UTC): in Chile that shifted the
  // day forward in the evening, so "today" disappeared from the picker and the first
  // selectable day looked like tomorrow. Format the date in local time instead.
  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateOptions: string[] = [];
  for (let i = 0; i < (businessInfo?.booking_window_days ?? 14); i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    // Skip closed days (y las fechas de vacaciones del profesional)
    if (closedDays.includes(d.getDay())) continue;
    if (closedDates.includes(toLocalDateStr(d))) continue;
    dateOptions.push(toLocalDateStr(d));
  }

  // Vista por horario disponible solo si el negocio la eligió y hay link de negocio.
  const viewPref = businessInfo?.booking_view_mode || "professional";
  const timeViewAllowed = !!tenantSlugState && (viewPref === "time" || viewPref === "both");
  const professionalViewAllowed = viewPref !== "time";
  const activeView: "time" | "professional" =
    timeViewAllowed && !professionalViewAllowed ? "time" : !timeViewAllowed ? "professional" : viewMode;
  const closedWeekdays = (businessInfo?.hours || []).filter((h) => h.is_closed).map((h) => h.day_of_week);

  const handleTimePick = (p: TimePick) => {
    preselectSlot.current = p.slot;
    setAutoAssigned(!!p.auto);
    setSelectedBarber({ id: p.barber.id, name: p.barber.name, avatar_url: p.barber.avatar_url, bio: null, specialties: null, intro_video_url: null, years_experience: null });
    setSelectedServices(p.services.map((sv) => ({ id: sv.id, name: sv.name, description: sv.description, price: sv.price, duration: sv.duration })));
    setSelectedDate(p.date);
    setSelectedSlot(p.slot);
    setStep("details");
  };

  // El perfil completo del negocio se muestra en el primer paso.
  const showProfile = step === "barber" && !!businessInfo?.name;

  if (businessSuspended) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-dark">Reservas no disponibles</h1>
          <p className="text-sm text-brand-gray mt-2">{businessName ? `${businessName} no está` : "Este negocio no está"} recibiendo reservas por el momento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark">
      {/* Header */}
      <div className="border-b border-gray-100 py-4 px-6 flex items-center justify-between bg-white">
        <div className="flex-1" />
        <div className="text-center">
          {showProfile ? (
            <p className="text-xs text-brand-blue uppercase tracking-widest font-medium">Agendar hora</p>
          ) : (
            <>
              {businessLogoUrl ? (
                <img src={businessLogoUrl} alt={businessName || "Logo"} className="h-12 mx-auto object-contain" />
              ) : (
                <img src="/logo-horizontal.png" alt="re-booking" className="h-10 mx-auto" />
              )}
              <p className="text-xs text-brand-blue uppercase tracking-widest mt-2 font-medium">
                {businessName || "Agendar Hora"}
              </p>
            </>
          )}
        </div>
        <div className="flex-1 flex justify-end">
          <button onClick={async () => {
            const { createClient } = await import("@/lib/supabase/client");
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = "/login";
          }} className="text-xs text-brand-gray hover:text-brand-dark transition-colors px-2 py-1 rounded">
            Salir
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Perfil del negocio (banner, logo, estrellas, dirección, cómo llegar…) */}
        {showProfile && businessInfo && <BusinessProfile info={businessInfo} />}

        {/* Botón pequeño para cambiar de vista (solo si el negocio eligió "ambas") */}
        {step === "barber" && timeViewAllowed && professionalViewAllowed && (
          <div className="mb-6 flex justify-center">
            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 text-xs font-semibold shadow-sm">
              <button onClick={() => setViewMode("time")} className={`rounded-full px-4 py-1.5 transition ${activeView === "time" ? "bg-brand-blue text-white" : "text-brand-gray"}`}>Por horario</button>
              <button onClick={() => setViewMode("professional")} className={`rounded-full px-4 py-1.5 transition ${activeView === "professional" ? "bg-brand-blue text-white" : "text-brand-gray"}`}>Por profesional</button>
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {step !== "confirmed" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {["barber", "service", "datetime", "details"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === s ? "bg-brand-blue text-white" :
                  ["barber", "service", "datetime", "details"].indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-brand-gray"
                }`}>
                  {i + 1}
                </div>
                {i < 3 && <div className="w-8 h-0.5 bg-gray-200" />}
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Service (después de elegir barbero) */}
        {step === "service" && (
          // pb-28 leaves room so the sticky "Continuar" bar never covers the last service.
          <div className="pb-28">
            <button onClick={() => setStep("barber")} className="text-brand-gray hover:text-brand-blue text-sm mb-4 flex items-center gap-1">
              ← Volver
            </button>
            <h2 className="text-2xl font-bold mb-2">Servicios de {selectedBarber?.name}</h2>
            <p className="text-brand-gray mb-6">Selecciona uno o mas servicios</p>
            <div className="space-y-3">
              {services.map((s) => {
                const isSelected = selectedServices.some((ss) => ss.id === s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServices(selectedServices.filter((ss) => ss.id !== s.id));
                      } else {
                        setSelectedServices([...selectedServices, s]);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors text-left ${
                      isSelected
                        ? "border-brand-blue bg-brand-blue/10"
                        : "border-gray-200 hover:border-brand-blue hover:bg-blue-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "border-brand-blue bg-brand-blue" : "border-gray-300"
                      }`}>
                        {isSelected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      {/* Visual reference photo (e.g. an example of "perfilado de barba") */}
                      {s.imageUrl && (
                        <img src={s.imageUrl} alt={s.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-brand-dark">{s.name}</p>
                        <p className="text-sm text-brand-gray">{s.duration} min{s.description ? ` · ${s.description}` : ""}</p>
                      </div>
                    </div>
                    <p className="text-brand-blue font-bold text-lg flex-shrink-0 ml-2">{formatCurrency(Number(s.price))}</p>
                  </button>
                );
              })}
            </div>

          </div>
        )}

        {/* Sticky bottom bar for the service step: the "Continuar" button stays pinned to
            the bottom of the screen the moment a service is picked, so the client doesn't
            have to scroll past the whole list to find it. Shows the running total too. */}
        {step === "service" && selectedServices.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-brand-gray leading-tight">
                  {selectedServices.length} servicio{selectedServices.length > 1 ? "s" : ""} · {totalDuration} min
                </p>
                <p className="text-brand-blue font-bold text-lg leading-tight">{formatCurrency(totalPrice)}</p>
              </div>
              <button
                onClick={() => setStep("datetime")}
                className="shrink-0 px-8 py-3 rounded-xl bg-brand-blue text-white font-bold hover:bg-blue-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* Vista por horario: servicio → día y hora → profesional disponible */}
        {step === "barber" && activeView === "time" && (
          <TimeFirstFlow tenantSlug={tenantSlugState} closedWeekdays={closedWeekdays} windowDays={businessInfo?.booking_window_days ?? null} onPick={handleTimePick} />
        )}

        {/* Step 1: Barber (PRIMERO) */}
        {step === "barber" && activeView === "professional" && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Elige tu profesional</h2>
            <p className="text-brand-gray mb-6">Selecciona un miembro del equipo</p>

            {/* First available button */}
            <button
              onClick={async () => {
                const res = await fetch(`/api/public/first-available?date=${selectedDate || toLocalDateStr(new Date())}${tenantSlugState ? `&tenant=${tenantSlugState}` : ""}`);
                const data = await res.json();
                if (data.barber) {
                  setAutoAssigned(true);
                  setSelectedBarber(data.barber);
                  setSelectedServices([]);
                  setStep("service");
                }
              }}
              className="w-full mb-4 p-4 rounded-xl border-2 border-brand-blue bg-brand-blue/10 hover:bg-brand-blue/20 transition-colors text-center"
            >
              <p className="font-bold text-brand-blue text-lg">Primer profesional disponible</p>
              <p className="text-xs text-brand-gray">Te asignamos al profesional con mas disponibilidad</p>
            </button>

            <p className="text-center text-xs text-brand-gray mb-4">o elige directamente:</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {barbers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setAutoAssigned(false); setSelectedBarber(b); setSelectedServices([]); setStep("service"); }}
                  className="flex flex-col items-center p-5 rounded-2xl border border-gray-200 hover:border-brand-blue hover:shadow-lg transition-all text-center group"
                >
                  {b.avatar_url ? (
                    <img src={b.avatar_url} alt={b.name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-100 group-hover:border-brand-blue/50 transition-colors" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-xl font-bold text-brand-gray group-hover:bg-brand-blue/10 group-hover:text-brand-blue transition-colors">
                      {b.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                  )}
                  <p className="font-semibold text-brand-dark text-sm mt-3">{b.name}</p>
                  {b.specialties && b.specialties.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 mt-2">
                      {b.specialties.slice(0, 3).map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue text-[10px] rounded-full">{s}</span>
                      ))}
                    </div>
                  )}
                  {b.bio && <p className="text-xs text-brand-gray mt-2 line-clamp-2">{b.bio}</p>}
                  {b.years_experience && (
                    <p className="text-[10px] text-brand-gray mt-1">{b.years_experience} años de experiencia</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === "datetime" && (
          <div>
            <button onClick={() => setStep("service")} className="text-brand-gray hover:text-brand-blue text-sm mb-4 flex items-center gap-1">
              ← Volver
            </button>
            <h2 className="text-2xl font-bold mb-2">Selecciona fecha y hora</h2>
            <p className="text-brand-gray mb-6">{selectedServices.map((s) => s.name).join(" + ")} con {selectedBarber?.name}</p>

            {/* Date selection */}
            <div className="mb-6">
              <label className="text-sm text-brand-gray mb-2 block">Fecha</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dateOptions.map((d) => {
                  const dateObj = new Date(d + "T12:00:00");
                  const dayName = dateObj.toLocaleDateString("es-CL", { weekday: "short" });
                  const dayNum = dateObj.getDate();
                  const monthName = dateObj.toLocaleDateString("es-CL", { month: "short" });
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-colors ${
                        selectedDate === d
                          ? "border-brand-blue bg-brand-blue/10 text-brand-dark"
                          : "border-gray-200 text-brand-gray hover:border-brand-blue/50"
                      }`}
                    >
                      <span className="text-xs uppercase">{dayName}</span>
                      <span className="text-lg font-bold">{dayNum}</span>
                      <span className="text-xs">{monthName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            <div>
              <label className="text-sm text-brand-gray mb-2 block">Hora disponible</label>
              {loadingSlots ? (
                <div className="text-center py-8 text-brand-gray">Buscando horarios...</div>
              ) : slots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-brand-gray mb-4">No hay horarios disponibles para esta fecha</p>
                  {!showWaitlist && !waitlistSubmitted && (
                    <button
                      onClick={() => setShowWaitlist(true)}
                      className="px-4 py-2 border border-brand-blue text-brand-blue rounded-xl hover:bg-brand-blue/10 text-sm"
                    >
                      Avisame cuando haya hora
                    </button>
                  )}
                  {showWaitlist && (
                    <div className="mt-4 p-4 bg-white border border-gray-200 rounded-xl text-left space-y-3">
                      <p className="text-sm text-brand-dark font-medium">Te avisamos cuando se libere una hora:</p>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-3 py-2 text-sm text-brand-dark placeholder:text-brand-gray focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                      />
                      <input
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-3 py-2 text-sm text-brand-dark placeholder:text-brand-gray focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                      />
                      <input
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        placeholder="Telefono (WhatsApp)"
                        className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-3 py-2 text-sm text-brand-dark placeholder:text-brand-gray focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none"
                      />
                      <button
                        onClick={async () => {
                          if (!clientName) return;
                          await fetch("/api/public/waitlist", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              clientName,
                              clientEmail,
                              clientPhone,
                              serviceId: selectedServices[0]?.id || null,
                              barberId: selectedBarber?.id || null,
                              preferredDate: selectedDate,
                            }),
                          });
                          setShowWaitlist(false);
                          setWaitlistSubmitted(true);
                        }}
                        disabled={!clientName}
                        className="w-full py-2 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        Anotarme en lista de espera
                      </button>
                    </div>
                  )}
                  {waitlistSubmitted && (
                    <p className="text-green-400 text-sm mt-2">Listo! Te avisaremos cuando haya hora disponible.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {slots.map((slot) => {
                    const time = new Date(slot).toLocaleTimeString("es-CL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-3 rounded-xl border text-sm font-medium transition-colors ${
                          selectedSlot === slot
                            ? "border-brand-blue bg-brand-blue text-white"
                            : "border-gray-200 text-brand-dark hover:border-brand-blue hover:text-brand-blue"
                        }`}
                      >
                        {time}
                        {spots[slot] != null && (
                          <span className={`block text-[10px] leading-tight ${
                            selectedSlot === slot ? "font-normal text-white/80" : spots[slot] === 1 ? "font-semibold text-red-500" : "font-normal text-brand-gray"
                          }`}>
                            {spots[slot]} {spots[slot] === 1 ? "cupo" : "cupos"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}

            <button
              onClick={() => { setError(""); setStep("details"); }}
              disabled={!selectedSlot}
              className="w-full mt-6 py-3 rounded-xl bg-brand-blue text-white font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 4: Client details */}
        {step === "details" && (
          <div>
            <button onClick={() => setStep("datetime")} className="text-brand-gray hover:text-brand-blue text-sm mb-4 flex items-center gap-1">
              ← Volver
            </button>
            <h2 className="text-2xl font-bold mb-2">Tus datos</h2>
            <p className="text-brand-gray mb-6">Ingresa tu informacion para confirmar la cita</p>

            {/* Summary card */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-brand-gray">Servicios</span>
                <span className="text-brand-dark font-medium">{selectedServices.map((s) => s.name).join(" + ")}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-brand-gray">Profesional</span>
                <span className="text-brand-dark font-medium">{selectedBarber?.name}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-brand-gray">Fecha</span>
                <span className="text-brand-dark">{new Date(selectedDate + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-brand-gray">Hora</span>
                <span className="text-brand-dark font-bold">{new Date(selectedSlot).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-brand-gray">Duracion</span>
                <span className="text-brand-dark">{totalDuration} min</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="text-brand-gray">Total</span>
                <span className="text-brand-blue font-bold text-lg">{formatCurrency(totalPrice)}</span>
              </div>
              {depositRequired && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-yellow-800 font-medium">Abono requerido ({depositPercentage}%)</span>
                    <span className="text-yellow-800 font-bold">{formatCurrency(Math.ceil(totalPrice * depositPercentage / 100))}</span>
                  </div>
                  <p className="text-[10px] text-yellow-700 mt-1">{depositMessage || "Se cobra al confirmar la reserva. El resto se paga en el local."}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-brand-gray mb-1 block">Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => { setClientEmail(e.target.value); setClientFound(false); }}
                  onBlur={async () => {
                    if (clientEmail && clientEmail.includes("@")) {
                      const res = await fetch(`/api/public/client-lookup?email=${encodeURIComponent(clientEmail)}`);
                      const data = await res.json();
                      if (data.found) {
                        setClientName(data.client.name);
                        setClientPhone(data.client.phone || "");
                        setClientFound(true);
                      }
                    }
                  }}
                  placeholder="tu@email.com (para confirmacion)"
                  className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-3 text-brand-dark placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none"
                />
                {clientFound && (
                  <p className="text-xs text-green-400 mt-1">Bienvenido de vuelta! Datos prellenados.</p>
                )}
              </div>
              <div>
                <label className="text-sm text-brand-gray mb-1 block">Nombre *</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Tu nombre completo"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-3 text-brand-dark placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-brand-gray mb-1 block">Celular (WhatsApp) *</label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+56 9 XXXX XXXX"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-3 text-brand-dark placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-brand-gray mb-1 block">Direccion (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Calle, numero, comuna"
                  className="w-full rounded-xl border border-gray-200 bg-brand-light/50 px-4 py-3 text-brand-dark placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3 text-center bg-red-50 rounded-lg py-2">{error}</p>}

            <button
              onClick={handleBook}
              disabled={!clientName.trim() || !clientPhone.trim() || submitting}
              className="w-full mt-6 py-4 rounded-xl bg-brand-blue text-white font-bold text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Procesando..." : depositRequired ? `Pagar abono ${formatCurrency(Math.ceil(totalPrice * depositPercentage / 100))}` : "Confirmar Cita"}
            </button>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === "confirmed" && (
          <div className="text-center py-12">
            {/* Show the business's own logo on the confirmation when it has one, so an
                independent professional (e.g. Saray) sees their own brand. Tenants with no
                logo get a neutral success mark instead of a mascot illustration. */}
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt={businessName || "Logo"} className="h-20 mx-auto mb-4 object-contain drop-shadow-lg" />
            ) : (
              <SuccessMark size={80} className="mb-4" />
            )}
            <h2 className="text-3xl font-bold mb-3">Cita Confirmada!</h2>
            <p className="text-brand-gray mb-6">Tu cita ha sido agendada exitosamente</p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 text-left max-w-sm mx-auto mb-8">
              <p className="text-sm text-brand-gray mb-1">Servicios</p>
              <p className="text-brand-dark font-semibold mb-4">{selectedServices.map((s) => s.name).join(" + ")}</p>

              <p className="text-sm text-brand-gray mb-1">Profesional</p>
              <p className="text-brand-dark font-semibold mb-4">{selectedBarber?.name}</p>

              <p className="text-sm text-brand-gray mb-1">Fecha</p>
              <p className="text-brand-dark font-semibold mb-4">
                {selectedSlot ? new Date(selectedSlot).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : selectedDate}
              </p>

              <p className="text-sm text-brand-gray mb-1">Hora</p>
              <p className="text-brand-blue font-bold text-xl">
                {selectedSlot ? new Date(selectedSlot).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </p>

              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                <span className="text-sm text-brand-gray">Total</span>
                <span className="text-brand-dark font-bold">{formatCurrency(totalPrice)}</span>
              </div>
            </div>

            {clientEmail && (
              <p className="text-sm text-gray-500 mb-6">
                Te enviamos un email de confirmacion a <strong className="text-gray-300">{clientEmail}</strong>
              </p>
            )}

            {/* Payment option */}
            {/* Online payment on the confirmation screen — hidden for now at Nico's
                request (clients pay in the shop). Flip ONLINE_PAYMENT_ON_CONFIRM to true
                to bring it back. */}
            {ONLINE_PAYMENT_ON_CONFIRM && totalPrice > 0 && appointmentId && (
              <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl">
                <p className="text-sm text-brand-gray mb-3">Quieres pagar ahora?</p>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/payments/create-preference", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        appointmentId,
                        services: selectedServices.map((s) => ({ name: s.name, price: Number(s.price) })),
                        clientName,
                        clientEmail,
                        totalPrice,
                      }),
                    });
                    const data = await res.json();
                    if (data.initPoint) {
                      window.location.href = data.initPoint;
                    }
                  }}
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors mb-2"
                >
                  Pagar {formatCurrency(totalPrice)} con MercadoPago
                </button>
                <p className="text-xs text-gray-500 text-center">O puedes pagar directamente en el local</p>
              </div>
            )}

            <button
              onClick={() => {
                setStep("barber");
                setSelectedServices([]);
                setSelectedBarber(null);
                setSelectedSlot("");
                setClientName("");
                setClientEmail("");
                setClientPhone("");
                setNotes("");
                setClientFound(false);
                setShowWaitlist(false);
                setWaitlistSubmitted(false);
              }}
              className="px-6 py-3 rounded-xl border border-gray-200 text-brand-gray hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              Agendar otra cita
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 py-4 text-center text-xs text-brand-gray">
        re-booking · rebooking.cl
      </div>
    </div>
  );
}
