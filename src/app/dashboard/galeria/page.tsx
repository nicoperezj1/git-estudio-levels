"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  barber: { name: string } | null;
  service: { name: string } | null;
}

interface Barber { id: string; name: string; }
interface Service { id: string; name: string; }

export default function GaleriaPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState("");
  const [filterBarber, setFilterBarber] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();

  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  const fetchData = async () => {
    setLoading(true);
    const t = getActiveTenantId();
    const gParams = new URLSearchParams();
    if (filterBarber) gParams.set("barberId", filterBarber);
    if (t) gParams.set("tenantId", t);
    const q = t ? `?tenantId=${t}` : "";
    const [imgRes, barbRes, svcRes] = await Promise.all([
      fetch(`/api/gallery${gParams.toString() ? `?${gParams.toString()}` : ""}`),
      fetch(`/api/barberos${q}`),
      fetch(`/api/services${q}`),
    ]);
    setImages(await imgRes.json());
    setBarbers(await barbRes.json());
    setServices(await svcRes.json());
    setLoading(false);
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchData();
  }, [filterBarber, tenantLoading, tenant?.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBarber) {
      showToast("Selecciona un profesional primero", "error");
      return;
    }

    setUploading(true);

    // Upload file
    const formData = new FormData();
    formData.append("file", file);
    formData.append("barberId", selectedBarber);

    const uploadRes = await fetch("/api/gallery/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      showToast("Error subiendo imagen", "error");
      setUploading(false);
      return;
    }

    const { url } = await uploadRes.json();

    // Save to gallery table
    await fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: selectedBarber,
        imageUrl: url,
        caption: caption || null,
        serviceId: selectedService || null,
      }),
    });

    showToast("Foto subida!", "success");
    setCaption("");
    setUploading(false);
    e.target.value = "";
    fetchData();
  };

  const deleteImage = async (id: string) => {
    const ok = await confirm({
      title: "Eliminar foto",
      message: "Quieres quitar esta foto de la galeria?",
      confirmText: "Eliminar",
      variant: "danger",
    });
    if (!ok) return;

    await fetch(`/api/gallery?id=${id}`, { method: "DELETE" });
    showToast("Foto eliminada", "success");
    fetchData();
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Galeria de Trabajos</h1>
          <p className="text-gray-500 text-sm">Portafolio de trabajos de tu equipo</p>
        </div>
      </div>

      {/* Upload section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
        <h3 className="font-bold text-gray-800 mb-3">Subir Foto</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Profesional *</label>
            <select value={selectedBarber} onChange={(e) => setSelectedBarber(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Seleccionar</option>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Servicio</label>
            <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Opcional</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Descripcion</label>
            <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="Ej: Fade medio con barba"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className={`block w-full py-2 text-center rounded-lg text-sm font-medium cursor-pointer transition-colors ${
              uploading || !selectedBarber
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}>
              {uploading ? "Subiendo..." : "Seleccionar Foto"}
              <input type="file" accept="image/*" onChange={handleUpload}
                disabled={uploading || !selectedBarber}
                className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">Filtrar:</span>
        <select value={filterBarber} onChange={(e) => setFilterBarber(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">Todos los profesionales</option>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Gallery grid */}
      {loading ? <Spinner /> : images.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Sin fotos aun</p>
          <p className="text-sm">Sube la primera foto de un trabajo!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img: any) => (
            <div key={img.id} className="group relative rounded-lg overflow-hidden bg-gray-100 aspect-square">
              <img
                src={img.image_url}
                alt={img.caption || "Trabajo"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <p className="text-white text-sm font-medium">{img.barber?.name}</p>
                {img.caption && <p className="text-gray-300 text-xs">{img.caption}</p>}
                {img.service && <p className="text-gray-400 text-xs">{img.service.name}</p>}
                <button onClick={() => deleteImage(img.id)}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-700">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
