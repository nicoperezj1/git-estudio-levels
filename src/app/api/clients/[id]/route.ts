import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminSupabase();
  const clientId = params.id;

  // Get client details
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Get all appointments for this client
  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id, date, start_time, status,
      barber:profiles(name),
      services:appointment_services(
        price,
        service:services(name)
      )
    `)
    .eq("client_id", clientId)
    .order("date", { ascending: false });

  // Get all transactions for this client
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      id, total, payment_method, created_at,
      items:transaction_items(description, total)
    `)
    .eq("client_id", clientId)
    .eq("type", "income")
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  // Calculate stats
  const totalSpent = (transactions || []).reduce((sum, t) => sum + Number(t.total), 0);
  const totalVisits = (appointments || []).filter((a) => a.status === "completed").length;
  const totalNoShows = (appointments || []).filter((a) => a.status === "no_show").length;
  const totalCancelled = (appointments || []).filter((a) => a.status === "cancelled").length;
  const totalBooked = (appointments || []).length;
  const attendanceRate = totalBooked > 0 ? Math.round(((totalBooked - totalNoShows - totalCancelled) / totalBooked) * 100) : 100;
  const lastVisit = appointments?.find((a) => a.status === "completed")?.date || null;

  // Most used services
  const serviceCount: Record<string, number> = {};
  for (const appt of appointments || []) {
    for (const s of (appt.services as any[]) || []) {
      const name = s.service?.name;
      if (name) serviceCount[name] = (serviceCount[name] || 0) + 1;
    }
  }
  const favoriteServices = Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Most visited barber
  const barberCount: Record<string, number> = {};
  for (const appt of appointments || []) {
    const name = (appt.barber as any)?.name;
    if (name) barberCount[name] = (barberCount[name] || 0) + 1;
  }
  const favoriteBarber = Object.entries(barberCount)
    .sort((a, b) => b[1] - a[1])[0];

  return NextResponse.json({
    client,
    stats: {
      totalSpent,
      totalVisits,
      totalNoShows,
      totalCancelled,
      attendanceRate,
      lastVisit,
      averageSpend: totalVisits > 0 ? Math.round(totalSpent / totalVisits) : 0,
      favoriteServices,
      favoriteBarber: favoriteBarber ? { name: favoriteBarber[0], visits: favoriteBarber[1] } : null,
    },
    appointments: (appointments || []).slice(0, 20),
    transactions: (transactions || []).slice(0, 20),
  });
}

// PATCH: editar los datos de un cliente (nombre, celular, correo, notas, etiquetas).
// Antes esta ruta no tenia PATCH: la pantalla de Clientes no podia guardar nada.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminSupabase();
  const { data: existing } = await supabase.from("clients").select("id, tenant_id").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  // Solo clientes de su propio negocio (el super_admin puede con cualquiera).
  if (role !== "super_admin" && existing.tenant_id !== tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const update: Record<string, any> = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    update.name = name;
  }
  if (body.phone !== undefined) {
    const phone = String(body.phone || "").trim();
    if (phone && phone.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "El celular no es válido" }, { status: 400 });
    update.phone = phone || null;
  }
  if (body.email !== undefined) {
    const email = String(body.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "El correo no es válido" }, { status: 400 });
    update.email = email || null;
  }
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes) : null;
  if (Array.isArray(body.personality_tags)) update.personality_tags = body.personality_tags.map((t: any) => String(t)).slice(0, 30);

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supabase.from("clients").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, client: data });
}
