"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { EmptyIcons } from "@/components/ui/empty-state";

interface Barber {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  description: string | null;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
}

export default function TenantBookingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    // Skip known routes
    const reserved = ["login", "landing", "booking", "portal", "dashboard", "reset-password", "cancel", "review", "ranking", "galeria"];
    if (reserved.includes(slug)) {
      router.replace(`/${slug}`);
      return;
    }

    fetch(`/api/public/tenant-booking?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tenant) {
          setTenant(data.tenant);
          setBarbers(data.barbers || []);
        } else if (data.error === "suspended") {
          setUnavailable(true);
        } else {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-dark">Reservas no disponibles</h1>
          <p className="text-sm text-brand-gray mt-2">Este negocio no está recibiendo reservas por el momento.</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 ring-4 ring-gray-50 flex items-center justify-center">
            <EmptyIcons.search className="w-6 h-6 text-gray-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold text-brand-dark">Negocio no encontrado</h1>
          <p className="text-sm text-brand-gray mt-2">No existe un negocio con el identificador "{slug}"</p>
          <a href="/landing" className="inline-block mt-4 px-4 py-2 bg-brand-blue text-white text-sm rounded-xl hover:opacity-90">
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }

  // Redirect to booking with tenant context
  // The booking page already supports ?branch=slug filter
  if (tenant) {
    router.replace(`/booking?tenant=${slug}`);
  }

  return null;
}
