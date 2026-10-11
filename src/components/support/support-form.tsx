"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Camera, CheckCircle2, X } from "lucide-react";
import { SUPPORT_AREAS, SUPPORT_MAX_IMAGES, SUPPORT_MAX_TOTAL_BYTES } from "@/lib/support";
import { compressImage } from "@/lib/image-compress";
import { inputClass, primaryButton, ghostButton } from "@/components/ui/premium";

interface Shot { id: string; file: File; url: string }

export function SupportForm({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const [area, setArea] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState(() => {
    try { return localStorage.getItem("support_phone") || ""; } catch { return ""; }
  });
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caseId, setCaseId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError("");
    const room = SUPPORT_MAX_IMAGES - shots.length;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (list.length > room) setError(`Puedes adjuntar hasta ${SUPPORT_MAX_IMAGES} capturas.`);
    const next: Shot[] = [];
    for (const f of picked) {
      try {
        // Se achican para que los 5 viajen livianos (la API acepta ~4 MB en total).
        const small = await compressImage(f, { maxDimension: 1400, maxBytes: 650 * 1024 });
        next.push({ id: `${Date.now()}-${Math.random()}`, file: small, url: URL.createObjectURL(small) });
      } catch {
        setError("No pudimos leer una de las imágenes. Prueba con otra captura.");
      }
    }
    setShots((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!area) return setError("Elige en qué parte del sistema ocurrió.");
    if (title.trim().length < 4) return setError("Escribe un título corto para el problema.");
    if (description.trim().length < 10) return setError("Cuéntanos qué pasó (al menos una frase).");
    if (phone.replace(/\D/g, "").length < 8) return setError("Escribe tu número de WhatsApp para contactarte.");
    const total = shots.reduce((n, s) => n + s.file.size, 0);
    if (total > SUPPORT_MAX_TOTAL_BYTES) return setError("Las capturas pesan demasiado. Quita alguna o usa capturas más livianas.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("area", area);
      fd.set("title", title.trim());
      fd.set("description", description.trim());
      fd.set("phone", phone.trim());
      fd.set("pageUrl", typeof window !== "undefined" ? window.location.pathname : pathname || "");
      fd.set("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "");
      for (const s of shots) fd.append("images", s.file, s.file.name);
      const res = await fetch("/api/support", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setError(data?.error || "No pudimos enviar tu caso. Inténtalo de nuevo."); return; }
      try { localStorage.setItem("support_phone", phone.trim()); } catch { /* sin almacenamiento */ }
      setCaseId(data.caseId || "");
    } catch {
      setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (caseId) {
    return (
      <div className="space-y-4 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" strokeWidth={1.5} />
        <div>
          <p className="text-sm text-brand-gray">Recibimos tu caso</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-brand-dark">{caseId}</p>
        </div>
        <p className="mx-auto max-w-sm text-sm text-brand-gray">
          Lo vamos a solucionar en <strong className="text-brand-dark">menos de 48 horas</strong> y te contactaremos por
          WhatsApp al <strong className="text-brand-dark">{phone}</strong>. Guarda tu número de caso por si lo necesitas.
        </p>
        {onClose && <button onClick={onClose} className={primaryButton}>Listo</button>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-brand-gray">¿Dónde ocurrió el problema? *</label>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORT_AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                area === a ? "border-transparent bg-brand-blue text-white shadow-md shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/50 hover:text-brand-dark"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-brand-gray">Título *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ej: No me deja guardar una cita" className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-brand-gray">Cuéntanos qué pasó *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="¿Qué estabas haciendo? ¿Qué esperabas que pasara y qué pasó? Si salió un mensaje rojo, escríbelo."
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-brand-gray">Capturas de pantalla (hasta {SUPPORT_MAX_IMAGES})</label>
        <div className="flex flex-wrap gap-2">
          {shots.map((s) => (
            <div key={s.id} className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt="Captura" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Quitar captura"
                onClick={() => setShots((prev) => prev.filter((x) => x.id !== s.id))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {shots.length < SUPPORT_MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 text-brand-gray transition-colors hover:border-brand-blue hover:text-brand-blue"
            >
              <Camera className="h-5 w-5" strokeWidth={1.75} />
              <span className="text-[10px] font-semibold">Agregar</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <p className="mt-1.5 text-[11px] text-brand-gray">Una captura de lo que ves nos ayuda a resolverlo más rápido.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-brand-gray">Tu WhatsApp para contactarte *</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+56 9 1234 5678" className={inputClass} />
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500">{error}</p>}

      <p className="text-[11px] text-brand-gray">Solucionamos tu caso en menos de 48 horas y te escribimos por WhatsApp.</p>

      <div className="flex justify-end gap-2">
        {onClose && <button type="button" onClick={onClose} className={ghostButton}>Cancelar</button>}
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Enviando..." : "Enviar caso"}</button>
      </div>
    </form>
  );
}
