"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";

interface Barber { id: string; name: string; }
interface Service { id: string; name: string; price: number; duration: number; }
interface CustomPrice { service_id: string; custom_price: number | null; custom_duration: number | null; }

export default function BarberPreciosPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedBarber, setSelectedBarber] = useState("");
  const [customPrices, setCustomPrices] = useState<CustomPrice[]>([]);
  const [assignedServices, setAssignedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const q = t ? `&tenantId=${t}` : "";
    const q2 = t ? `?tenantId=${t}` : "";
    Promise.all([
      fetch(`/api/barberos${q2}`).then((r) => r.json()),
      fetch(`/api/services?all=true${q}`).then((r) => r.json()),
    ]).then(([b, s]) => {
      setBarbers(Array.isArray(b) ? b : []);
      setServices(Array.isArray(s) ? s.filter((sv: any) => sv.active) : []);
      if (b.length > 0) setSelectedBarber(b[0].id);
      setLoading(false);
    });
  }, [tenantLoading, tenant?.id]);

  useEffect(() => {
    if (selectedBarber) {
      fetch(`/api/barber-services?barberId=${selectedBarber}`)
        .then((r) => r.json())
        .then((data) => setCustomPrices(Array.isArray(data) ? data : []));
      fetch(`/api/barber-service-assignments?barberId=${selectedBarber}`)
        .then((r) => r.json())
        .then((data) => setAssignedServices(Array.isArray(data) ? data : []));
    }
  }, [selectedBarber]);

  const getCustom = (serviceId: string) => {
    return customPrices.find((c) => c.service_id === serviceId);
  };

  const toggleService = async (serviceId: string) => {
    let newAssigned: string[];
    if (assignedServices.includes(serviceId)) {
      newAssigned = assignedServices.filter((id) => id !== serviceId);
    } else {
      newAssigned = [...assignedServices, serviceId];
    }
    setAssignedServices(newAssigned);
    await fetch("/api/barber-service-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId: selectedBarber, serviceIds: newAssigned }),
    });
  };

  const saveCustom = async (serviceId: string, price: string, duration: string) => {
    setSaving(serviceId);
    await fetch("/api/barber-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: selectedBarber,
        serviceId,
        customPrice: price ? parseInt(price) : null,
        customDuration: duration ? parseInt(duration) : null,
      }),
    });
    showToast("Precio actualizado", "success");
    setSaving(null);
    // Refresh
    const res = await fetch(`/api/barber-services?barberId=${selectedBarber}`);
    setCustomPrices(await res.json());
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Precios por Profesional</h1>
        <p className="text-gray-500 text-sm">Configura precios y duraciones personalizadas por profesional</p>
      </div>

      {/* Barber selector */}
      <select value={selectedBarber} onChange={(e) => setSelectedBarber(e.target.value)}
        className="w-full md:w-64 border rounded-lg px-3 py-2 font-medium">
        {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Como funciona:</strong> Si dejas un campo vacio, se usa el precio/duracion default del servicio.
          Solo completa los campos que sean diferentes para este profesional.
        </p>
      </div>

      {/* Services table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-center p-4 font-medium text-gray-600 w-14">Activo</th>
              <th className="text-left p-4 font-medium text-gray-600">Servicio</th>
              <th className="text-center p-4 font-medium text-gray-600">Precio Default</th>
              <th className="text-center p-4 font-medium text-gray-600">Precio Custom</th>
              <th className="text-center p-4 font-medium text-gray-600">Duracion Default</th>
              <th className="text-center p-4 font-medium text-gray-600">Duracion Custom</th>
              <th className="text-center p-4 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {services.map((s) => {
              const custom = getCustom(s.id);
              return (
                <ServiceRow
                  key={s.id}
                  service={s}
                  customPrice={custom?.custom_price}
                  customDuration={custom?.custom_duration}
                  saving={saving === s.id}
                  active={assignedServices.length === 0 || assignedServices.includes(s.id)}
                  onToggle={() => toggleService(s.id)}
                  onSave={(price, duration) => saveCustom(s.id, price, duration)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiceRow({ service, customPrice, customDuration, saving, active, onToggle, onSave }: {
  service: { id: string; name: string; price: number; duration: number };
  customPrice: number | null | undefined;
  customDuration: number | null | undefined;
  saving: boolean;
  active: boolean;
  onToggle: () => void;
  onSave: (price: string, duration: string) => void;
}) {
  const [price, setPrice] = useState(customPrice ? String(customPrice) : "");
  const [duration, setDuration] = useState(customDuration ? String(customDuration) : "");

  useEffect(() => {
    setPrice(customPrice ? String(customPrice) : "");
    setDuration(customDuration ? String(customDuration) : "");
  }, [customPrice, customDuration]);

  return (
    <tr className={`hover:bg-gray-50 ${!active ? "opacity-40" : ""}`}>
      <td className="p-4 text-center">
        <input type="checkbox" checked={active} onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
      </td>
      <td className="p-4 font-medium">{service.name}</td>
      <td className="p-4 text-center text-gray-500">{formatCurrency(Number(service.price))}</td>
      <td className="p-4 text-center">
        <input type="number" min="0" step="1" value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={String(service.price)}
          className="w-24 border rounded px-2 py-1 text-center text-sm" />
      </td>
      <td className="p-4 text-center text-gray-500">{service.duration} min</td>
      <td className="p-4 text-center">
        <input type="number" min="5" step="5" value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder={String(service.duration)}
          className="w-20 border rounded px-2 py-1 text-center text-sm" />
      </td>
      <td className="p-4 text-center">
        <button onClick={() => onSave(price, duration)}
          disabled={saving}
          className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "..." : "Guardar"}
        </button>
      </td>
    </tr>
  );
}
