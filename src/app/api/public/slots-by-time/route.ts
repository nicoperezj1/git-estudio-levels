import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: horas disponibles de TODO el equipo para un día y unos servicios ("vista por horario").
// Reutiliza /api/public/availability por profesional, así las reglas (horarios, bloqueos,
// pausas, citas) son exactamente las mismas que en la vista por profesional.
// Params: ?tenant=<slug>&date=YYYY-MM-DD&serviceIds=id1,id2
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const url = new URL(req.url);
  const slug = url.searchParams.get("tenant") || url.searchParams.get("branch");
  const date = url.searchParams.get("date");
  const serviceIds = (url.searchParams.get("serviceIds") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);

  if (!slug || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || serviceIds.length === 0) {
    return NextResponse.json({ error: "tenant, date y serviceIds requeridos" }, { status: 400 });
  }

  const norm = (s: string) => s.replace(/-/g, "").toLowerCase();
  const { data: allTenants } = await supabase.from("tenants").select("id, slug").eq("active", true);
  const tenant = (allTenants || []).find((t) => norm(t.slug) === norm(slug));
  if (!tenant) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });

  const [{ data: barbers }, { data: services }] = await Promise.all([
    supabase.from("profiles").select("id, name, avatar_url").or("role.eq.barber,and(role.in.(admin,super_admin),also_attends_clients.eq.true)").eq("active", true).eq("tenant_id", tenant.id),
    supabase.from("services").select("id, name, description, price, duration").eq("active", true).eq("tenant_id", tenant.id).in("id", serviceIds),
  ]);
  if (!services || services.length !== serviceIds.length) return NextResponse.json({ error: "Servicio no válido" }, { status: 400 });
  if (!barbers || barbers.length === 0) return NextResponse.json({ date, slots: [], barbers: {} });

  const ids = barbers.map((b) => b.id);
  const [{ data: assignments }, { data: customs }] = await Promise.all([
    supabase.from("barber_service_assignments").select("barber_id, service_id").in("barber_id", ids),
    supabase.from("barber_services").select("barber_id, service_id, custom_price, custom_duration").in("barber_id", ids),
  ]);

  // Por profesional: ¿hace todos los servicios pedidos? (sin asignaciones = hace todos) y su precio/duración.
  const barberInfo: Record<string, any> = {};
  for (const b of barbers) {
    const assigned = new Set((assignments || []).filter((a) => a.barber_id === b.id).map((a) => a.service_id));
    if (assigned.size > 0 && !serviceIds.every((id) => assigned.has(id))) continue;
    const list = services.map((s) => {
      const c = (customs || []).find((x) => x.barber_id === b.id && x.service_id === s.id);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        price: c?.custom_price ? Number(c.custom_price) : Number(s.price),
        duration: c?.custom_duration || s.duration,
      };
    });
    barberInfo[b.id] = {
      id: b.id,
      name: b.name,
      avatar_url: b.avatar_url,
      services: list,
      duration: list.reduce((n, s) => n + Number(s.duration), 0),
      price: list.reduce((n, s) => n + s.price, 0),
    };
  }

  const origin = url.origin;
  const results = await Promise.all(
    Object.values(barberInfo).map(async (b: any) => {
      try {
        const r = await fetch(`${origin}/api/public/availability?barberId=${b.id}&date=${date}&duration=${b.duration}`, { cache: "no-store" });
        const d = await r.json();
        return { id: b.id as string, slots: (d.slots || []) as string[] };
      } catch {
        return { id: b.id as string, slots: [] as string[] };
      }
    })
  );

  const bySlot = new Map<string, string[]>();
  for (const r of results) for (const s of r.slots) bySlot.set(s, [...(bySlot.get(s) || []), r.id]);
  const slots = Array.from(bySlot.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([slot, barberIds]) => ({ slot, barberIds }));

  return NextResponse.json({ date, slots, barbers: barberInfo });
}
