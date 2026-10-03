"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import {
  ChevronLeft, MoreVertical, Phone, Mail, MessageCircle, CalendarPlus, Camera, ImageIcon, FileText, Pin, X,
  Wallet, Receipt, CalendarCheck, UserX, Clock, Scissors, Upload, StickyNote, TrendingUp, Percent, UserCheck,
} from "lucide-react";
import { Panel, StatCard, primaryButton, ghostButton, inputClass } from "@/components/ui/premium";

interface ClientData {
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    created_at: string;
  };
  stats: {
    totalSpent: number;
    totalVisits: number;
    totalNoShows: number;
    totalCancelled: number;
    attendanceRate: number;
    lastVisit: string | null;
    averageSpend: number;
    favoriteServices: Array<{ name: string; count: number }>;
    favoriteBarber: { name: string; visits: number } | null;
  };
  appointments: Array<{
    id: string;
    date: string;
    start_time: string;
    status: string;
    barber: { name: string } | null;
    services: Array<{ price: number; service: { name: string } }>;
  }>;
  transactions: Array<{
    id: string;
    total: number;
    payment_method: string;
    created_at: string;
    items: Array<{ description: string; total: number }>;
  }>;
}

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  in_progress: "En Atencion",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No Asistio",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-gray-100 text-gray-700",
};

const paymentLabels: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Debito",
  credit_card: "Credito",
  transfer: "Transferencia",
};

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Array<{ id: string; note: string; pinned: boolean; created_at: string; created_by_profile: { name: string } | null }>>([]);
  const [newNote, setNewNote] = useState("");
  const [pinNote, setPinNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; caption: string | null; created_at: string; barber: { name: string } | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Documentos PDF/Word del cliente (Nico, 28-sep). Solo se muestra la seccion si el
  // negocio tiene habilitada la carga de archivos (tenants.client_files_enabled).
  const [docsEnabled, setDocsEnabled] = useState(false);
  const [documents, setDocuments] = useState<Array<{ id: string; file_name: string; size_bytes: number | null; created_at: string; uploaded_by_name: string | null; url: string | null }>>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");
  // Editar datos del cliente (nombre, celular, correo, notas)
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = () => {
    if (!data) return;
    const c = data.client;
    setEditForm({ name: c.name || "", phone: c.phone || "", email: c.email || "", notes: c.notes || "" });
    setEditError("");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!data) return;
    if (!editForm.name.trim()) { setEditError("El nombre es obligatorio"); return; }
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(`/api/clients/${params.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { setEditError(r?.error || "No se pudo guardar"); return; }
      setData({ ...data, client: { ...data.client, ...r.client } });
      setEditing(false);
    } catch {
      setEditError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setSavingEdit(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await fetch(`/api/clients/${params.id}/documents`, { cache: "no-store" });
      const d = await res.json();
      setDocsEnabled(!!d.enabled);
      setDocuments(Array.isArray(d.documents) ? d.documents : []);
    } catch {
      setDocsEnabled(false);
    }
  };

  const uploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocError("");
    setUploadingDoc(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/clients/${params.id}/documents`, { method: "POST", body: formData });
      if (res.ok) {
        await loadDocuments();
      } else {
        const r = await res.json().catch(() => ({}));
        setDocError(r.error || "No se pudo subir el archivo");
      }
    } catch {
      setDocError("No se pudo subir el archivo. Revisa tu conexion.");
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  };

  const deleteDocument = async (documentId: string) => {
    if (!window.confirm("¿Eliminar este documento? Esta accion no se puede deshacer.")) return;
    const res = await fetch(`/api/clients/${params.id}/documents?documentId=${documentId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } else {
      const r = await res.json().catch(() => ({}));
      setDocError(r.error || "No se pudo eliminar el documento");
    }
  };

  useEffect(() => {
    if (params.id) {
      loadDocuments();
      fetch(`/api/clients/${params.id}`)
        .then((r) => r.json())
        .then((d) => { if (d.client) setData(d); })
        .finally(() => setLoading(false));
      fetch(`/api/clients/${params.id}/notes`)
        .then((r) => r.json())
        .then((n) => setNotes(Array.isArray(n) ? n : []));
      fetch(`/api/clients/${params.id}/photos`)
        .then((r) => r.json())
        .then((p) => setPhotos(Array.isArray(p) ? p : []));
    }
  }, [params.id]);

  const reloadNotes = async () => {
    const res = await fetch(`/api/clients/${params.id}/notes`);
    const n = await res.json();
    setNotes(Array.isArray(n) ? n : []);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const res = await fetch(`/api/clients/${params.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: newNote, pinned: pinNote }),
    });
    if (!res.ok) { alert("No se pudo guardar la nota. Intenta de nuevo."); return; }
    setNewNote("");
    setPinNote(false);
    await reloadNotes();
  };

  const saveEditedNote = async (noteId: string) => {
    if (!editingText.trim()) return;
    const res = await fetch(`/api/clients/${params.id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, note: editingText }),
    });
    if (!res.ok) { alert("No se pudo actualizar la nota."); return; }
    setEditingNoteId(null);
    setEditingText("");
    await reloadNotes();
  };

  const togglePinNote = async (noteId: string, pinned: boolean) => {
    const res = await fetch(`/api/clients/${params.id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, pinned: !pinned }),
    });
    if (res.ok) await reloadNotes();
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    const res = await fetch(`/api/clients/${params.id}/notes?noteId=${noteId}`, { method: "DELETE" });
    if (!res.ok) { alert("No se pudo eliminar la nota."); return; }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("caption", "");
    try {
      const res = await fetch(`/api/clients/${params.id}/photos`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const photosRes = await fetch(`/api/clients/${params.id}/photos`);
        setPhotos(await photosRes.json());
      }
    } catch (err) {
      console.error("Error subiendo foto:", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deletePhoto = async (photoId: string) => {
    await fetch(`/api/clients/${params.id}/photos?photoId=${photoId}`, { method: "DELETE" });
    setPhotos(photos.filter((p) => p.id !== photoId));
  };

  if (loading) return <Spinner />;
  if (!data) return <div className="p-6 text-center text-gray-500">Cliente no encontrado</div>;

  const { client, stats, appointments, transactions } = data;

  const initials = client.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const tags: string[] = (client as any).personality_tags || [];
  const attendanceTone = stats.attendanceRate >= 80 ? "green" : stats.attendanceRate >= 50 ? "amber" : "red";
  const sinceLabel = new Date(client.created_at).toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Volver */}
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm font-medium text-brand-gray transition-colors hover:text-brand-blue">
        <ChevronLeft className="h-4 w-4" strokeWidth={2} /> Volver a clientes
      </button>

      {/* Hero del cliente */}
      <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 md:p-7">
        <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-brand-blue/20 to-emerald-400/10 blur-3xl" />
        {/* Menú de 3 puntos (arriba a la derecha) */}
        <div className="absolute right-3 top-3 z-20">
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Más opciones"
            className="flex h-9 w-9 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-gray-100 hover:text-brand-dark">
            <MoreVertical className="h-5 w-5" strokeWidth={2} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                <button onClick={() => { setMenuOpen(false); openEdit(); }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-dark hover:bg-gray-50">
                  Modificar datos
                </button>
              </div>
            </>
          )}
        </div>
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-blue to-emerald-500 text-3xl font-black text-white shadow-lg shadow-brand-blue/25">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-brand-dark md:text-3xl">{client.name}</h1>
              <p className="mt-0.5 text-sm text-brand-gray">
                Cliente desde <span className="inline-block first-letter:uppercase">{sinceLabel}</span>
                {stats.totalVisits === 0 && (
                  <span className="ml-2 rounded-md bg-emerald-500 px-1.5 py-0.5 align-middle text-[9px] font-extrabold uppercase tracking-wide text-white">Nuevo</span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-dark">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-brand-gray" strokeWidth={1.75} />
                  {client.phone || <span className="text-brand-gray">Sin teléfono</span>}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0 text-brand-gray" strokeWidth={1.75} />
                  <span className="truncate">{client.email || <span className="text-brand-gray">Sin email</span>}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => router.push("/dashboard/calendario")} className={primaryButton}>
              <CalendarPlus className="h-4 w-4" strokeWidth={2} /> Agendar
            </button>
            {client.phone && (
              <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-500 ring-1 ring-emerald-500/20 transition-colors hover:bg-emerald-500/20">
                <MessageCircle className="h-4 w-4" strokeWidth={2} /> WhatsApp
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className={ghostButton}>
                <Mail className="h-4 w-4" strokeWidth={2} /> Email
              </a>
            )}
          </div>
        </div>
        {client.notes && (
          <p className="relative mt-4 rounded-2xl bg-brand-light px-4 py-3 text-sm text-brand-dark">{client.notes}</p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(false)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-brand-dark">Editar datos del cliente</h3>
            <label className="block text-xs font-medium text-brand-gray">Nombre
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-medium text-brand-gray">Celular
              <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-medium text-brand-gray">Correo
              <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-medium text-brand-gray">Notas
              <textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className={`${inputClass} mt-1 w-full resize-y`} />
            </label>
            {editError && <p className="text-xs text-red-500">{editError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(false)} className={ghostButton}>Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className={primaryButton}>{savingEdit ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Metricas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total gastado" value={formatCurrency(stats.totalSpent)} Icon={Wallet} hero className="col-span-2 lg:col-span-1" hint={`${stats.totalVisits} visitas`} />
        <StatCard label="Ticket promedio" value={formatCurrency(stats.averageSpend)} Icon={TrendingUp} tone="violet" />
        <StatCard label="Visitas" value={stats.totalVisits} Icon={CalendarCheck} tone="teal" />
        <StatCard label="Asistencia" value={`${stats.attendanceRate}%`} Icon={Percent} tone={attendanceTone as any} hint={`${stats.totalNoShows} no asistió · ${stats.totalCancelled} canceladas`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Notas internas */}
          <Panel title="Notas internas" subtitle="Preferencias y observaciones (solo visibles para el equipo)">
            {/* Enter hace salto de línea; la nota solo se guarda al apretar Agregar */}
            <div className="space-y-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                placeholder="Ej: Prefiere atención por la tarde y avisar por WhatsApp..."
                className={`${inputClass} w-full resize-y`}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-brand-gray">
                  <input type="checkbox" checked={pinNote} onChange={(e) => setPinNote(e.target.checked)} className="rounded" />
                  <Pin className="h-3.5 w-3.5" strokeWidth={2} /> Fijar arriba
                </label>
                <button onClick={addNote} disabled={!newNote.trim()} className={primaryButton}>Agregar</button>
              </div>
            </div>
            {notes.length === 0 ? (
              <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-8 text-center">
                <StickyNote className="mb-2 h-6 w-6 text-brand-gray" strokeWidth={1.5} />
                <p className="text-sm text-brand-gray">Sin notas todavía. Agrega las preferencias del cliente.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className={`rounded-2xl border p-3.5 ${n.pinned ? "border-amber-400/40 bg-amber-500/10" : "border-gray-100 bg-brand-light"}`}>
                    {editingNoteId === n.id ? (
                      <div className="space-y-2">
                        <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={4} autoFocus className={`${inputClass} w-full resize-y`} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingNoteId(null); setEditingText(""); }} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-brand-gray hover:bg-white">Cancelar</button>
                          <button onClick={() => saveEditedNote(n.id)} disabled={!editingText.trim()} className={primaryButton}>Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="flex items-start gap-1.5 whitespace-pre-wrap break-words text-sm text-brand-dark">
                          {n.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" strokeWidth={2} />}
                          <span className="min-w-0">{n.note}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-brand-gray">
                            {new Date(n.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                            {n.created_by_profile && ` · ${n.created_by_profile.name}`}
                          </p>
                          <div className="flex items-center gap-3 text-xs font-semibold">
                            <button onClick={() => togglePinNote(n.id, n.pinned)} className="text-brand-gray hover:text-amber-600">{n.pinned ? "Desfijar" : "Fijar"}</button>
                            <button onClick={() => { setEditingNoteId(n.id); setEditingText(n.note); }} className="text-brand-gray hover:text-brand-dark">Editar</button>
                            <button onClick={() => deleteNote(n.id)} className="text-brand-gray hover:text-red-500">Eliminar</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Fotos */}
          <Panel
            title="Fotos y registro visual"
            subtitle="Antes y después, evolución o referencias del cliente"
            action={
              /* Punto 11 (Pablo): en celular "capture" fuerza la camara; se dejan dos botones,
                 uno abre la camara directo y el otro el selector de galeria. */
              <div className={`flex gap-2 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                <label className={`${primaryButton} cursor-pointer !px-3 !py-2 text-xs`}>
                  <Camera className="h-4 w-4" strokeWidth={2} /> {uploading ? "Subiendo..." : "Tomar foto"}
                  <input type="file" accept="image/*" capture="environment" onChange={uploadPhoto} className="hidden" />
                </label>
                <label className={`${ghostButton} cursor-pointer !px-3 !py-2 text-xs`}>
                  <ImageIcon className="h-4 w-4" strokeWidth={2} /> Galería
                  <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
                </label>
              </div>
            }
          >
            {photos.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
                  <Camera className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-brand-dark">Aún no hay fotos</p>
                <p className="mt-1 max-w-xs text-xs text-brand-gray">Sube una foto después de cada atención para llevar el registro de su evolución.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative overflow-hidden rounded-2xl">
                    <img
                      src={photo.url}
                      alt={photo.caption || "Foto del cliente"}
                      onClick={() => setLightboxUrl(photo.url)}
                      className="h-36 w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5">
                      <p className="text-[10px] font-medium text-white">
                        {new Date(photo.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                        {photo.barber?.name && ` · ${photo.barber.name}`}
                      </p>
                    </div>
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      aria-label="Eliminar foto"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Historial de citas */}
          <Panel title={`Historial de citas (${appointments.length})`} flush>
            <div className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto px-5 pb-3">
              {appointments.length === 0 ? (
                <p className="py-8 text-center text-sm text-brand-gray">Sin citas registradas</p>
              ) : appointments.map((appt: any) => (
                <div key={appt.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-brand-light">
                    <span className="text-sm font-bold leading-none tabular-nums text-brand-dark">{new Date(appt.date + "T12:00:00").getDate()}</span>
                    <span className="mt-0.5 text-[9px] font-semibold uppercase text-brand-gray">
                      {new Date(appt.date + "T12:00:00").toLocaleDateString("es-CL", { month: "short" }).replace(".", "")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-dark">
                      {appt.services?.map((s: any) => s.service?.name).join(", ") || "Sin servicio"}
                    </p>
                    <p className="truncate text-xs text-brand-gray">{appt.barber?.name}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[appt.status] || ""}`}>
                      {statusLabels[appt.status] || appt.status}
                    </span>
                    {/* HH:MM tal cual viene guardado (toLocaleTimeString re-aplicaba el offset UTC-3). */}
                    <span className="text-[11px] tabular-nums text-brand-gray">{appt.start_time?.match(/(\d{2}:\d{2})/)?.[1] || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Historial de compras */}
          <Panel title={`Historial de compras (${transactions.length})`} flush>
            <div className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto px-5 pb-3">
              {transactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-brand-gray">Sin compras registradas</p>
              ) : transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                    <Receipt className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-dark">
                      {tx.items?.map((i: any) => i.description).join(", ") || "Venta"}
                    </p>
                    <p className="text-xs text-brand-gray">
                      {new Date(tx.created_at).toLocaleDateString("es-CL")} · {paymentLabels[tx.payment_method] || tx.payment_method}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-sm font-bold tabular-nums text-emerald-500">{formatCurrency(Number(tx.total))}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          <Panel title="Resumen">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-2 text-brand-gray"><UserCheck className="h-4 w-4" strokeWidth={1.75} /> Profesional favorito</dt>
                <dd className="truncate font-semibold text-brand-dark">{stats.favoriteBarber?.name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-2 text-brand-gray"><Clock className="h-4 w-4" strokeWidth={1.75} /> Última visita</dt>
                <dd className="font-semibold text-brand-dark">
                  {stats.lastVisit ? new Date(stats.lastVisit).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "Nunca"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-2 text-brand-gray"><UserX className="h-4 w-4" strokeWidth={1.75} /> No asistió</dt>
                <dd className="font-semibold tabular-nums text-brand-dark">{stats.totalNoShows}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Perfil del cliente" subtitle="Toca para marcar o quitar">
            <div className="flex flex-wrap gap-2">
              {["Reservado", "Extrovertido", "Puntual", "Impuntual", "VIP", "Conversador", "Apurado", "Detallista"].map((tag) => {
                const isActive = tags.includes(tag.toLowerCase());
                return (
                  <button key={tag} onClick={async () => {
                    const current: string[] = (client as any).personality_tags || [];
                    const updated = isActive ? current.filter((t: string) => t !== tag.toLowerCase()) : [...current, tag.toLowerCase()];
                    await fetch(`/api/clients/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personality_tags: updated }) });
                    setData({ ...data!, client: { ...client, personality_tags: updated } as any });
                  }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                      isActive ? "border-transparent bg-brand-blue text-white shadow-md shadow-brand-blue/25" : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/40 hover:text-brand-dark"
                    }`}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </Panel>

          {stats.favoriteServices.length > 0 && (
            <Panel title="Servicios favoritos">
              <div className="space-y-2.5">
                {stats.favoriteServices.map((sv) => {
                  const max = Math.max(...stats.favoriteServices.map((x) => x.count), 1);
                  return (
                    <div key={sv.name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2 font-semibold text-brand-dark">
                          <Scissors className="h-3.5 w-3.5 text-brand-blue" strokeWidth={2} /> {sv.name}
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-brand-gray">{sv.count}x</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-brand-light">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-blue to-emerald-500" style={{ width: `${(sv.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Documentos (PDF / Word) — solo si el negocio lo tiene habilitado. */}
          {docsEnabled && (
            <Panel
              title="Documentos"
              subtitle="Fichas, exámenes o consentimientos (PDF o Word, hasta 10 MB)"
              action={
                <label className={`${primaryButton} cursor-pointer !px-3 !py-2 text-xs ${uploadingDoc ? "pointer-events-none opacity-50" : ""}`}>
                  <Upload className="h-4 w-4" strokeWidth={2} /> {uploadingDoc ? "Subiendo..." : "Subir"}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={uploadDocument}
                    className="hidden"
                  />
                </label>
              }
            >
              {docError && <p className="mb-3 text-sm text-red-500">{docError}</p>}
              {documents.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-8 text-center">
                  <FileText className="mb-2 h-6 w-6 text-brand-gray" strokeWidth={1.5} />
                  <p className="text-sm text-brand-gray">Sin documentos</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                        <FileText className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {doc.url ? (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-brand-blue hover:underline">{doc.file_name}</a>
                        ) : (
                          <span className="block truncate text-sm font-semibold text-brand-dark">{doc.file_name}</span>
                        )}
                        <p className="text-[11px] text-brand-gray">
                          {new Date(doc.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                          {doc.uploaded_by_name && ` · ${doc.uploaded_by_name}`}
                          {doc.size_bytes ? ` · ${(doc.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                        </p>
                      </div>
                      <button onClick={() => deleteDocument(doc.id)} className="text-xs font-semibold text-red-500 hover:text-red-400">Eliminar</button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Foto del cliente" className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl" />
          <button onClick={() => setLightboxUrl(null)} aria-label="Cerrar" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
