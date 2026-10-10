"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { EmptyIcons } from "@/components/ui/empty-state";
import { parseCsvText, rowsToClients } from "@/lib/client-import";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  created_at?: string;
}

export default function ClientesPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "", source: "walk_in", sourceDetail: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>();
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const { role, effectiveRole } = useAuth();
  // Use effectiveRole (server-provided, reliable on Vercel) for security-sensitive gating.
  const gateRole = effectiveRole || role;
  const isAdmin = gateRole === "admin" || gateRole === "super_admin";
  // Import/Export is a security-sensitive bulk operation: only owners/admins.
  // NOT available to barbers NOR receptionists.
  const canImportExport = gateRole === "admin" || gateRole === "super_admin";
  // Punto 10 (Pablo): "Metricas" (origen de clientes) es solo para Administrador y
  // Recepcion, igual que el resto de la vista de negocio.
  const canSeeMetrics = isAdmin || gateRole === "receptionist";

  const fetchClients = async (query: string, p: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (tenant?.id) params.set("tenantId", tenant.id);
      params.set("page", String(p));
      params.set("limit", "50");
      const res = await fetch(`/api/clients?${params.toString()}`);
      const data = await res.json();
      setClients(data.clients || []);
      setTotalPages(data.totalPages || 1);
      setTotalClients(data.total || 0);
      setPage(data.page || 1);
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchClients("");
  }, [tenant?.id, tenantLoading]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchClients(value, 1); }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Bug (reportado por Nico, 27-sep): esto nunca revisaba si la respuesta fue exitosa
      // — si el insert fallaba en el servidor (ej. error de base de datos), igual se
      // mostraba "Cliente creado exitosamente" y se cerraba el modal, dando a entender
      // que el origen (source) quedo guardado cuando en realidad el cliente ni siquiera
      // se creo. Ahora se revisa la respuesta antes de celebrar el exito.
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, tenantId: tenant?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error al crear cliente", "error");
        return;
      }
      showToast("Cliente creado exitosamente", "success");
      setShowModal(false);
      setFormData({ name: "", email: "", phone: "", notes: "", source: "walk_in", sourceDetail: "" });
      fetchClients(search);
    } catch (err) {
      console.error("Error creating client:", err);
      showToast("Error al crear cliente", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map((c) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Eliminar ${selectedIds.size} cliente(s)? Esta accion no se puede deshacer.`)) return;
    setDeleting(true);
    const allIds = Array.from(selectedIds);
    setProgressTotal(allIds.length);
    setProgressCurrent(0);
    setDeleteProgress(`Eliminando ${allIds.length} clientes...`);

    const batchSize = 50;
    let deleted = 0;
    for (let i = 0; i < allIds.length; i += batchSize) {
      const batch = allIds.slice(i, i + batchSize);
      await fetch("/api/clients/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }),
      });
      deleted += batch.length;
      setProgressCurrent(deleted);
      setDeleteProgress(`Eliminando... ${deleted} de ${allIds.length}`);
    }

    showToast(`${deleted} cliente(s) eliminados`, "success");
    setSelectedIds(new Set());
    setDeleting(false);
    setDeleteProgress("");
    setProgressCurrent(0);
    setProgressTotal(0);
    fetchClients(search);
  };

  // handleDeleteAll removed: the "Eliminar TODOS" button it powered was wiping the whole
  // client base by accident. Bulk delete of everything is no longer exposed in the UI.

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Clientes</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
            Nuevo
          </button>
          {(canSeeMetrics || canImportExport) && (
            <div className="relative">
              <button
                aria-label="Más opciones"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {moreOpen && (
                <>
                  <button aria-label="Cerrar" className="fixed inset-0 z-20 cursor-default" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    {canSeeMetrics && (
                      <button
                        onClick={() => { setMoreOpen(false); router.push("/dashboard/clientes/metricas"); }}
                        className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        📊 Métricas
                      </button>
                    )}
                    {canImportExport && (
                      <>
                        <button
                          onClick={() => { setMoreOpen(false); importInputRef.current?.click(); }}
                          className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Importar CSV/Excel
                        </button>
                        <a
                          href="/api/clients/export" download onClick={() => setMoreOpen(false)}
                          className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Exportar
                        </a>
                      </>
                    )}
                  </div>
                </>
              )}
              <input type="file" accept=".csv,.xlsx,.xls,.txt" ref={importInputRef} className="hidden" onChange={async (e) => {
              const input = e.target;
              const file = input.files?.[0];
              if (!file) return;
              try {
                // Leer el archivo (CSV o Excel) a una tabla y convertirla en clientes.
                let table: unknown[][];
                if (/\.(xlsx|xls)$/i.test(file.name)) {
                  const XLSX = (await import("xlsx")).default;
                  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
                  // Hoja "Clientes" si existe; si no, la primera.
                  const sheetName = workbook.SheetNames.find((n) => /cliente/i.test(n)) || workbook.SheetNames[0];
                  const sheet = workbook.Sheets[sheetName];
                  table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as unknown[][];
                } else {
                  table = parseCsvText(await file.text());
                }
                const parsed = rowsToClients(table);
                if (parsed.error) { showToast(parsed.error, "error"); return; }
                const clients = parsed.clients;
                if (clients.length === 0) { showToast("No se encontraron clientes con nombre en el archivo.", "error"); return; }
                const extra = parsed.withoutName > 0 ? ` (${parsed.withoutName} filas sin nombre se omiten)` : "";
                if (!confirm(`Se encontraron ${clients.length} clientes${extra}. Importar?`)) return;

                setImporting(true);
                setProgressTotal(clients.length);
                setProgressCurrent(0);
                setImportProgress(`Importando 0 de ${clients.length} clientes...`);

                // Lotes chicos para no pasar el tiempo maximo del servidor.
                const batchSize = 50;
                let imported = 0;
                let skipped = 0;
                let failed = 0;
                let lastError = "";
                for (let i = 0; i < clients.length; i += batchSize) {
                  const batch = clients.slice(i, i + batchSize);
                  try {
                    const res = await fetch("/api/clients/import", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ clients: batch, tenantId: tenant?.id }), // el superadmin importa al negocio que esta viendo
                    });
                    const data = await res.json().catch(() => ({} as any));
                    if (!res.ok) {
                      failed += batch.length;
                      lastError = typeof data?.error === "string" && data.error ? data.error : `error ${res.status}`;
                    } else {
                      imported += data.imported || 0;
                      skipped += data.skipped || 0;
                      failed += data.failed || 0;
                      if (data.lastError) lastError = data.lastError;
                    }
                  } catch {
                    failed += batch.length;
                    lastError = "sin conexion con el servidor";
                  }
                  setProgressCurrent(Math.min(i + batchSize, clients.length));
                  setImportProgress(`Importando... ${Math.min(i + batchSize, clients.length)} de ${clients.length}`);
                }

                const msg = `${imported} importados, ${skipped} repetidos omitidos` + (failed ? `, ${failed} con error (${lastError})` : "");
                showToast(msg, failed && !imported ? "error" : "success");
                fetchClients("");
              } catch (err: any) {
                console.error("[import clientes]", err);
                showToast(`No se pudo leer el archivo: ${err?.message || "formato no reconocido"}. Prueba guardandolo como CSV o Excel (.xlsx).`, "error");
              } finally {
                setImporting(false);
                setImportProgress("");
                setProgressCurrent(0);
                setProgressTotal(0);
                input.value = "";
              }
            }} />
            </div>
          )}
        </div>
      </div>

      <input type="text" placeholder="Buscar por nombre, email o telefono..."
        value={search} onChange={(e) => handleSearch(e.target.value)}
        className="w-full border rounded-lg px-4 py-2" />

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-700 font-medium">{selectedIds.size} seleccionado(s)</span>
          <button onClick={handleBulkDelete} disabled={deleting}
            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {deleting ? "Eliminando..." : "Eliminar seleccionados"}
          </button>
          {/* "Eliminar TODOS" removed on purpose: it sat right next to "Eliminar
              seleccionados" and was fired by accident, wiping the first 50 clients (with
              their points, appointments and reviews). Deleting the whole client base is
              too destructive to expose as a one-click button in the bulk bar. */}
          <button onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-white text-brand-gray">
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 w-10">
                <input type="checkbox" checked={clients.length > 0 && selectedIds.size === clients.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-gray-300" />
              </th>
              <th className="text-left p-4 font-medium text-gray-600">Nombre</th>
              <th className="text-left p-4 font-medium text-gray-600">Email</th>
              <th className="text-left p-4 font-medium text-gray-600">Telefono</th>
              <th className="text-left p-4 font-medium text-gray-600">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5}><Spinner /></td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500">No hay clientes</td></tr>
            ) : clients.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 rounded border-gray-300" />
                </td>
                <td className="p-4 font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => router.push(`/dashboard/clientes/${c.id}`)}>
                  {c.name}
                  {c.created_at && (Date.now() - new Date(c.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded">NUEVO</span>
                  )}
                </td>
                <td className="p-4">{c.email || "-"}</td>
                <td className="p-4">{c.phone || "-"}</td>
                <td className="p-4 text-gray-500">{c.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-sm text-brand-gray">
            {totalClients} clientes total · Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { const p = page - 1; setPage(p); fetchClients(search, p); }}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <button
              onClick={() => { const p = page + 1; setPage(p); fetchClients(search, p); }}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-modal flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4">Nuevo Cliente</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefono *</label>
                <input type="text" required value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">¿Cómo nos visitó?</label>
                <select value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value, sourceDetail: (e.target.value === "promotion" || e.target.value === "influencer") ? formData.sourceDetail : "" })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="walk_in">Pasó por fuera</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="facebook">Facebook</option>
                  <option value="referral">Referido de un amigo/conocido</option>
                  <option value="google_maps">Google Maps</option>
                  <option value="promotion">Promoción</option>
                  <option value="influencer">Influencer</option>
                </select>
              </div>
              {formData.source === "promotion" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código de descuento (opcional)</label>
                  <input type="text" value={formData.sourceDetail}
                    onChange={(e) => setFormData({ ...formData, sourceDetail: e.target.value })}
                    placeholder="Ej: DESCUENTO10"
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
              )}
              {formData.source === "influencer" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del influencer (opcional)</label>
                  <input type="text" value={formData.sourceDetail}
                    onChange={(e) => setFormData({ ...formData, sourceDetail: e.target.value })}
                    placeholder="Ej: @influencer"
                    className="w-full border rounded-lg px-3 py-2" />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit"
                  disabled={!formData.name.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading overlay for delete/import */}
      {(deleting || importing) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center animate-scale-in">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-brand-blue/5 ring-4 ring-brand-blue/10 flex items-center justify-center">
              <EmptyIcons.clients className="w-6 h-6 text-brand-blue animate-pulse" strokeWidth={1.75} />
            </div>
            
            <h3 className="text-xl font-bold text-brand-dark mb-2">
              {deleting ? "Eliminando clientes" : "Importando clientes"}
            </h3>
            
            {/* Progress count */}
            <p className="text-2xl font-bold text-brand-blue mb-1">
              {progressCurrent} <span className="text-sm font-normal text-brand-gray">de</span> {progressTotal}
            </p>
            
            {/* Progress bar */}
            {progressTotal > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-blue to-brand-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((progressCurrent / progressTotal) * 100)}%` }}
                />
              </div>
            )}
            
            <p className="text-sm text-brand-gray mb-1">
              {Math.round((progressCurrent / (progressTotal || 1)) * 100)}% completado
            </p>
            <p className="text-xs text-brand-gray/60 mt-3">No cierres esta pagina</p>
          </div>
        </div>
      )}
    </div>
  );
}
