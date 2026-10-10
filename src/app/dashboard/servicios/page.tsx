"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTenant } from "@/lib/tenant-context";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { compressImage } from "@/lib/image-compress";
import { GripVertical } from "lucide-react";

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  active: boolean;
  sort_order: number;
  image_url?: string | null;
  category?: string | null;
}

// Punto 2 (Nico, 27-sep): "agrupar por carpetas las categorias para que se vea mas
// ordenado y estetico" — mismo criterio de agrupacion y orden que ya usa POS (ver
// dashboard/pos/page.tsx): cada categoria con nombre, en el orden en que aparece por
// primera vez entre los servicios activos, y "Sin categoria" siempre al final.
const CATEGORY_NONE = "__sin_categoria__";

function groupServicesByCategory(list: Service[]): Array<{ key: string; label: string; items: Service[] }> {
  const order: string[] = [];
  for (const s of list) {
    const key = s.category || CATEGORY_NONE;
    if (key !== CATEGORY_NONE && !order.includes(key)) order.push(key);
  }
  const groups = order.map((key) => ({ key, label: key, items: list.filter((s) => (s.category || CATEGORY_NONE) === key) }));
  const uncategorized = list.filter((s) => !s.category);
  if (uncategorized.length) groups.push({ key: CATEGORY_NONE, label: "Sin categoria", items: uncategorized });
  return groups;
}

export default function ServiciosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", duration: "", category: "" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { tenant, loading: tenantLoading } = useTenant();

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchOffsetY, setTouchOffsetY] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Carpetas colapsadas (por categoria). Vacio = todas expandidas por defecto.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const toggleCategoryCollapsed = (key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const fetchServices = async () => {
    setLoading(true);
    const params = tenant?.id ? `?all=true&tenantId=${tenant.id}` : "?all=true";
    const res = await fetch(`/api/services${params}`);
    const data = await res.json();
    setServices(Array.isArray(data) ? data.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)) : []);
    setLoading(false);
  };

  useEffect(() => {
    if (tenantLoading) return;
    fetchServices();
  }, [tenant?.id, tenantLoading]);

  // Existing categories across current services, for the dropdown suggestions.
  const existingCategories = Array.from(
    new Set(services.map((s) => s.category).filter(Boolean))
  ) as string[];

  // Categorias creadas en el formulario que aun no tienen ningun servicio guardado.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const allCategories = Array.from(new Set([...existingCategories, ...extraCategories]));

  // Si la persona escribio una categoria nueva pero no alcanzo a pulsar "Agregar" y guarda el
  // servicio directo, se toma ese texto como la categoria (antes se perdia en silencio y el
  // servicio quedaba "Sin categoria"). Reutiliza una existente si el nombre coincide.
  const resolveCategoryOnSubmit = (): string => {
    if (form.category) return form.category;
    const name = newCategoryName.trim().replace(/\s+/g, " ");
    if (!creatingCategory || !name) return "";
    const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return allCategories.find((c) => norm(c) === norm(name)) || name;
  };

  // Crea la categoria y la deja seleccionada. Si ya existe una igual (sin importar
  // mayusculas/acentos) se reutiliza, para no duplicar grupos.
  const confirmNewCategory = () => {
    const name = newCategoryName.trim().replace(/\s+/g, " ");
    if (!name) return;
    const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const existing = allCategories.find((c) => norm(c) === norm(name));
    const final = existing || name;
    if (!existing) setExtraCategories((prev) => [...prev, final]);
    setForm((f) => ({ ...f, category: final }));
    setCreatingCategory(false);
    setNewCategoryName("");
  };

  const openNew = () => {
    setEditingService(null);
    setForm({ name: "", description: "", price: "", duration: "", category: "" });
    setCreatingCategory(false);
    setNewCategoryName("");
    setShowModal(true);
  };

  const openEdit = (s: Service) => {
    setEditingService(s);
    setForm({
      name: s.name,
      description: s.description || "",
      price: String(s.price),
      duration: String(s.duration),
      category: s.category || "",
    });
    setShowModal(true);
  };

  // Reference photo shown to clients while choosing this service in the public
  // booking flow (e.g. an example of "perfilado de barba"). Only available once the
  // service already exists, since the upload is keyed by service id.
  const uploadServicePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original || !editingService) return;
    if (!original.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(original.name)) {
      showToast("El archivo debe ser una imagen (JPG, PNG, WEBP)", "error");
      e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    // Compress big phone photos (15-40MB) down to a small JPEG in the browser instead
    // of rejecting them, and normalize the format so JPG/PNG/WEBP all work uniformly.
    let file: File;
    try {
      file = await compressImage(original, { maxBytes: 5 * 1024 * 1024 });
    } catch (err: any) {
      showToast(err.message || "No se pudo procesar la imagen", "error");
      setUploadingPhoto(false);
      e.target.value = "";
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/services/${editingService.id}/photo`, { method: "POST", body: form });
      const result = await res.json();
      if (res.ok) {
        setEditingService({ ...editingService, image_url: result.url });
        showToast("Foto actualizada", "success");
        fetchServices();
      } else {
        showToast(result.error || "Error al subir la foto", "error");
      }
    } catch {
      showToast("Error al subir la foto", "error");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const removeServicePhoto = async () => {
    if (!editingService) return;
    await fetch(`/api/services/${editingService.id}/photo`, { method: "DELETE" });
    setEditingService({ ...editingService, image_url: null });
    showToast("Foto eliminada", "success");
    fetchServices();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const categoryToSave = resolveCategoryOnSubmit() || null;

    if (editingService) {
      await fetch(`/api/services/${editingService.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          price: parseInt(form.price),
          duration: parseInt(form.duration),
          category: categoryToSave,
        }),
      });
      showToast("Servicio actualizado", "success");
    } else {
      await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          price: parseInt(form.price),
          duration: parseInt(form.duration),
          category: categoryToSave,
          sort_order: activeServices.length,
        }),
      });
      showToast("Servicio creado", "success");
    }

    setShowModal(false);
    fetchServices();
  };

  const toggleActive = async (s: Service) => {
    if (s.active) {
      const ok = await confirm({
        title: "Eliminar servicio",
        message: `Eliminar "${s.name}"? No aparecera en el booking ni POS.`,
        confirmText: "Eliminar",
        variant: "warning",
      });
      if (!ok) return;
    }

    await fetch(`/api/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    showToast(s.active ? "Servicio desactivado" : "Servicio activado", "success");
    fetchServices();
  };

  const activeServices = services.filter((s) => s.active);
  const inactiveServices = services.filter((s) => !s.active);
  const serviceGroups = groupServicesByCategory(activeServices);
  // Solo los servicios de carpetas expandidas, en orden de carpeta — es exactamente lo
  // que se renderiza y lo unico que se puede arrastrar, asi que el "index" de drag&drop
  // se calcula sobre esta lista (no sobre activeServices) para que ambos coincidan.
  const visibleFlat = serviceGroups.flatMap((g) => (collapsedCategories.has(g.key) ? [] : g.items));

  // ===== REORDER LOGIC =====
  const saveOrder = async (newList: Service[]) => {
    const order = newList.map((s, i) => ({ id: s.id, sort_order: i }));
    try {
      const res = await fetch("/api/services/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast("No se pudo guardar el orden. Recarga e intenta de nuevo", "error");
    }
  };

  // Orden de CATEGORIAS: el orden de las carpetas sale de la posicion de sus servicios, asi que
  // para mover una carpeta se reescribe el orden completo dejando cada categoria junta.
  // "Sin categoria" siempre queda al final. Es el mismo orden que ve el cliente al reservar.
  const [dragCat, setDragCat] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const moveCategory = (fromKey: string, toKey: string) => {
    if (fromKey === toKey || fromKey === CATEGORY_NONE || toKey === CATEGORY_NONE) return;
    const active = services.filter((x) => x.active);
    const inactive = services.filter((x) => !x.active);
    const groups = groupServicesByCategory(active);
    const keys = groups.map((g) => g.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from === -1 || to === -1) return;
    const [k] = keys.splice(from, 1);
    keys.splice(to, 0, k);
    const ordered = keys.flatMap((key) => groups.find((g) => g.key === key)!.items);
    const reordered = ordered.map((x, i) => ({ ...x, sort_order: i }));
    setServices([...reordered, ...inactive]);
    saveOrder(reordered);
    showToast("Orden de categorías actualizado", "success");
  };
  const stepCategory = (key: string, dir: -1 | 1) => {
    const keys = groupServicesByCategory(activeServices).map((g) => g.key).filter((x) => x !== CATEGORY_NONE);
    const i = keys.indexOf(key);
    const target = keys[i + dir];
    if (target) moveCategory(key, target);
  };
  // Numero de cada servicio en el orden real (el mismo en que aparece en el link de reserva).
  const positionById = new Map<string, number>();
  serviceGroups.forEach((g) => g.items.forEach((x) => positionById.set(x.id, positionById.size + 1)));

  // Arrastrar un servicio a OTRA categoria (o a "Sin categoria"): cambia su categoria y lo deja
  // en el lugar donde se suelta (antes de `beforeId`, o al final de la categoria si es null).
  const moveServiceToCategory = (item: Service, targetKey: string, beforeId: string | null) => {
    const active = services.filter((x) => x.active);
    const inactive = services.filter((x) => !x.active);
    const newCategory = targetKey === CATEGORY_NONE ? null : targetKey;
    const moved: Service = { ...item, category: newCategory };
    const groups = groupServicesByCategory(active.filter((x) => x.id !== item.id));
    let target = groups.find((g) => g.key === targetKey);
    if (!target) {
      target = { key: targetKey, label: targetKey, items: [] };
      if (targetKey === CATEGORY_NONE) groups.push(target); else groups.splice(groups.findIndex((g) => g.key === CATEGORY_NONE) === -1 ? groups.length : groups.findIndex((g) => g.key === CATEGORY_NONE), 0, target);
    }
    const at = beforeId ? target.items.findIndex((x) => x.id === beforeId) : -1;
    if (at === -1) target.items.push(moved); else target.items.splice(at, 0, moved);
    const reordered = groups.flatMap((g) => g.items).map((x, i) => ({ ...x, sort_order: i }));
    setServices([...reordered, ...inactive]);
    saveOrder(reordered);
    fetch(`/api/services/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory }),
    }).then((r) => {
      if (!r.ok) throw new Error();
      showToast(newCategory ? `Movido a "${newCategory}"` : "Movido a Sin categoría", "success");
    }).catch(() => showToast("No se pudo cambiar la categoría", "error"));
  };

  // Punto 2 (Nico, 27-sep): al agrupar por carpetas, arrastrar ya no reordena la lista
  // plana completa — solo tiene sentido reordenar DENTRO de la misma carpeta/categoria.
  // Se ubica cada servicio por su id (no por posicion en visibleFlat) dentro de su propio
  // grupo en activeServices, se reordena solo ese subconjunto, y se reinserta cada uno en
  // su mismo "slot" original — asi el resto de las categorias nunca cambia de posicion.
  const reorder = useCallback((fromIndex: number, toIndex: number): boolean => {
    const fromItem = visibleFlat[fromIndex];
    const toItem = visibleFlat[toIndex];
    if (!fromItem || !toItem) return false;
    const fromKey = fromItem.category || CATEGORY_NONE;
    const toKey = toItem.category || CATEGORY_NONE;
    if (fromKey !== toKey) {
      moveServiceToCategory(fromItem, toKey, toItem.id);
      return false; // ya muestra su propio aviso
    }

    setServices((prev) => {
      const active = prev.filter((s) => s.active);
      const inactive = prev.filter((s) => !s.active);

      const groupSlots = active
        .map((s, i) => ((s.category || CATEGORY_NONE) === fromKey ? i : -1))
        .filter((i) => i !== -1);
      const groupItems = groupSlots.map((i) => active[i]);
      const fromWithin = groupItems.findIndex((s) => s.id === fromItem.id);
      const toWithin = groupItems.findIndex((s) => s.id === toItem.id);
      if (fromWithin === -1 || toWithin === -1) return prev;

      const newGroupItems = [...groupItems];
      const [moved] = newGroupItems.splice(fromWithin, 1);
      newGroupItems.splice(toWithin, 0, moved);

      const merged = [...active];
      groupSlots.forEach((slot, idx) => { merged[slot] = newGroupItems[idx]; });
      const reordered = merged.map((s, i) => ({ ...s, sort_order: i }));
      saveOrder(reordered);
      return [...reordered, ...inactive];
    });
    return true;
  }, [visibleFlat, services]);

  // Desktop drag events
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      if (reorder(dragIndex, overIndex)) showToast("Orden actualizado", "success");
    }
    setDragIndex(null);
    setOverIndex(null);
    setOverCat(null);
  };

  // Touch drag events
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    setTouchStartY(touch.clientY);

    longPressTimer.current = setTimeout(() => {
      setDragIndex(index);
      setTouchDragging(true);
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
    }, 300);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragging || dragIndex === null) {
      // If not yet dragging, cancel long press if moved too much
      const touch = e.touches[0];
      if (Math.abs(touch.clientY - touchStartY) > 10) {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
      }
      return;
    }

    e.preventDefault();
    const touch = e.touches[0];
    setTouchOffsetY(touch.clientY - touchStartY);

    // Find which item we're over (solo la lista visible/agrupada — ver visibleFlat).
    for (let i = 0; i < visibleFlat.length; i++) {
      const el = itemRefs.current[i];
      if (el) {
        const rect = el.getBoundingClientRect();
        if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          setOverIndex(i);
          break;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    if (touchDragging && dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      if (reorder(dragIndex, overIndex)) showToast("Orden actualizado", "success");
    }

    setDragIndex(null);
    setOverIndex(null);
    setTouchDragging(false);
    setTouchOffsetY(0);
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Servicios</h1>
          <p className="text-brand-gray text-sm">Gestiona el menu de servicios de tu negocio</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90 text-sm font-medium transition-colors">
          Nuevo Servicio
        </button>
      </div>

      {/* Active services */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-brand-dark">Servicios Activos ({activeServices.length})</h2>
          <span className="text-xs text-brand-gray hidden md:block">Arrastra ⋮⋮ para ordenar · así se ve en tu link de reserva</span>
          <span className="text-xs text-brand-gray md:hidden">Mantén presionado para mover</span>
        </div>
        {loading ? (
          <div className="p-8"><Spinner /></div>
        ) : (
          <div ref={listRef} className="divide-y select-none">
            {(() => {
              // Contador de posicion dentro de visibleFlat (unico espacio de indices
              // compartido por render, drag&drop y touch — ver visibleFlat mas arriba).
              let flatIndex = -1;
              return serviceGroups.map((group) => {
                const isCollapsed = collapsedCategories.has(group.key);
                return (
                  <div key={group.key}>
                    {/* Encabezado de carpeta — siempre visible, incluso colapsada. Solo
                        se muestra si hay mas de una categoria o alguna con nombre, para
                        no agregar ruido visual a un negocio que no usa categorias. */}
                    {(serviceGroups.length > 1) && (
                      <div
                        draggable={group.key !== CATEGORY_NONE}
                        onDragStart={(e) => { e.stopPropagation(); setDragCat(group.key); }}
                        onDragOver={(e) => { if (dragCat || dragIndex !== null) { e.preventDefault(); setOverCat(group.key); } }}
                        onDrop={() => {
                          if (dragIndex !== null) {
                            const it = visibleFlat[dragIndex];
                            if (it && (it.category || CATEGORY_NONE) !== group.key) moveServiceToCategory(it, group.key, null);
                            setDragIndex(null); setOverIndex(null); setOverCat(null);
                          }
                        }}
                        onDragEnd={() => { if (dragCat && overCat) moveCategory(dragCat, overCat); setDragCat(null); setOverCat(null); }}
                        onClick={() => toggleCategoryCollapsed(group.key)}
                        className={`w-full flex items-center gap-2 px-3 md:px-4 py-2.5 transition-colors text-left cursor-pointer ${
                          dragCat === group.key ? "opacity-50 bg-brand-blue/5" : overCat === group.key && (dragCat || dragIndex !== null) ? "bg-brand-blue/10 border-t-2 border-t-brand-blue" : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        {group.key !== CATEGORY_NONE ? (
                          <span className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing" title="Arrastra para ordenar la categoría" onClick={(e) => e.stopPropagation()}>
                            <GripVertical className="w-4 h-4" />
                          </span>
                        ) : <span className="w-4" />}
                        <span className={`text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▸</span>
                        <span className="font-semibold text-sm text-brand-dark">{group.label}</span>
                        <span className="text-xs text-brand-gray">({group.items.length})</span>
                        {group.key !== CATEGORY_NONE && (
                          <span className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <button type="button" aria-label="Subir categoría" onClick={() => stepCategory(group.key, -1)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-brand-dark hover:bg-white rounded">▲</button>
                            <button type="button" aria-label="Bajar categoría" onClick={() => stepCategory(group.key, 1)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-brand-dark hover:bg-white rounded">▼</button>
                          </span>
                        )}
                      </div>
                    )}
                    {!isCollapsed && group.items.map((s) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      return (
                        <div
                          key={s.id}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={(e) => handleTouchStart(e, index)}
                          onTouchMove={(e) => handleTouchMove(e)}
                          onTouchEnd={handleTouchEnd}
                          className={`p-3 md:p-4 flex items-center gap-2 md:gap-3 transition-all border-t ${
                            dragIndex === index
                              ? "opacity-50 bg-brand-blue/5 scale-[0.98]"
                              : overIndex === index && dragIndex !== null
                              ? "border-t-2 border-t-brand-blue bg-brand-blue/5"
                              : "hover:bg-gray-50 cursor-grab"
                          } ${touchDragging && dragIndex === index ? "shadow-lg z-10 relative" : ""}`}
                          style={touchDragging && dragIndex === index ? { transform: `translateY(${touchOffsetY}px)` } : undefined}
                        >
                          {/* Drag handle */}
                          <span className="w-5 text-right text-[11px] tabular-nums text-gray-400/50 select-none flex-shrink-0">{positionById.get(s.id)}</span>
                          <div className="cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-gray-600 p-1" title="Arrastra para ordenar">
                            <GripVertical className="w-5 h-5" />
                          </div>

                          {/* Service info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-brand-dark text-sm md:text-base truncate">{s.name}</p>
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] md:text-xs font-medium flex-shrink-0">
                                {s.duration} min
                              </span>
                            </div>
                            {s.description && (
                              <p className="text-xs text-brand-gray mt-0.5 truncate hidden md:block">{s.description}</p>
                            )}
                          </div>

                          {/* Price + Actions */}
                          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                            <p className="text-sm md:text-lg font-bold text-brand-dark">{formatCurrency(Number(s.price))}</p>
                            <div className="hidden md:flex gap-1">
                              <button onClick={() => openEdit(s)}
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">Editar</button>
                              <button onClick={() => toggleActive(s)}
                                className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">Eliminar</button>
                            </div>
                            {/* Mobile: tap to open edit */}
                            <button onClick={() => openEdit(s)}
                              className="md:hidden p-2 text-brand-gray hover:text-brand-dark">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Inactive services */}
      {inactiveServices.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 opacity-75">
          <div className="p-4 border-b">
            <h2 className="font-bold text-brand-gray">Inactivos ({inactiveServices.length})</h2>
          </div>
          <div className="divide-y">
            {inactiveServices.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-500 line-through">{s.name}</p>
                  <p className="text-sm text-gray-400">{s.duration} min · {formatCurrency(Number(s.price))}</p>
                </div>
                <button onClick={() => toggleActive(s)}
                  className="px-3 py-1.5 text-xs border border-green-200 text-green-600 rounded-lg hover:bg-green-50">
                  Reactivar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md shadow-xl animate-scale-in">
            <h2 className="text-lg font-bold mb-4 text-brand-dark">
              {editingService ? "Editar Servicio" : "Nuevo Servicio"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Nombre</label>
                <input type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Corte Clasico"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Descripcion (opcional)</label>
                <input type="text" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Breve descripcion del servicio"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Categoria (opcional)</label>
                {/* Nico, 29-sep: en vez de escribir el nombre de la categoria cada vez (y
                    terminar con "Barba" y "barba" como grupos distintos), se elige una de las
                    existentes o se crea una con el boton "Crear nueva categoria". Los servicios
                    se agrupan por la categoria elegida. */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: "" })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      !form.category ? "bg-brand-blue text-white" : "bg-gray-100 text-brand-gray hover:bg-gray-200"
                    }`}
                  >
                    Sin categoria
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm({ ...form, category: cat })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.category === cat ? "bg-brand-blue text-white" : "bg-gray-100 text-brand-gray hover:bg-gray-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  {!creatingCategory && (
                    <button
                      type="button"
                      onClick={() => setCreatingCategory(true)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-brand-blue text-brand-blue hover:bg-brand-blue/5"
                    >
                      + Crear nueva categoria
                    </button>
                  )}
                </div>
                {creatingCategory && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); confirmNewCategory(); }
                        if (e.key === "Escape") { setCreatingCategory(false); setNewCategoryName(""); }
                      }}
                      placeholder="Nombre de la nueva categoria"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={confirmNewCategory}
                      className="px-3 py-2 bg-brand-blue text-white text-xs font-medium rounded-xl hover:opacity-90">
                      Agregar
                    </button>
                    <button type="button" onClick={() => { setCreatingCategory(false); setNewCategoryName(""); }}
                      className="px-3 py-2 text-xs text-brand-gray hover:bg-gray-100 rounded-xl">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Reference photo: shown to clients while choosing services in the
                  public booking page (e.g. an example of "perfilado de barba"). */}
              {editingService ? (
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Foto de referencia (opcional)</label>
                  <div className="flex items-center gap-3">
                    <label className="relative group cursor-pointer flex-shrink-0">
                      {editingService.image_url ? (
                        <img src={editingService.image_url} alt={editingService.name} className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-xs">
                          Foto
                        </div>
                      )}
                      {uploadingPhoto && (
                        <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                          <span className="text-[8px] text-white font-medium">Subiendo...</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" onChange={uploadServicePhoto} className="hidden" disabled={uploadingPhoto} />
                    </label>
                    <div className="text-xs text-brand-gray">
                      <p>Ej: una foto de un perfilado de barba, para que el cliente sepa que va a recibir.</p>
                      {editingService.image_url && (
                        <button type="button" onClick={removeServicePhoto} className="text-red-500 hover:underline mt-1">Quitar foto</button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-brand-gray italic">Podras agregar una foto de referencia despues de crear el servicio.</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Precio ($)</label>
                  <input type="number" required min="0" step="1" value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="8000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-gray mb-1">Duracion (min)</label>
                  <input type="number" required min="5" step="5" value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                    placeholder="30"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm">Cancelar</button>
                <button type="submit"
                  disabled={!form.name || !form.price || !form.duration}
                  className="px-5 py-2.5 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                  {editingService ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
