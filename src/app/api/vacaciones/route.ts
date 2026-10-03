import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { dateStrOffset, todayInChile } from "@/lib/utils";

// Vacaciones de profesionales (solo administrador). Un rango de fechas por profesional: bloquea su
// agenda y la reserva online (ver src/lib/vacations.ts). Tabla professional_vacations (migracion 095).

async function admin() {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return null;
  return c;
}
const isDate = (v: any) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

export async function GET() {
  const c = await admin();
  if (!c) return NextResponse.json({ vacations: [] }, { status: 403 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("professional_vacations")
    .select("id, barber_id, start_date, end_date, note, created_by_name, created_at")
    .eq("tenant_id", c.tenantId!).gte("end_date", dateStrOffset(todayInChile(), -60))
    .order("start_date", { ascending: true });
  if (error) return NextResponse.json({ vacations: [], migrationMissing: /does not exist|schema cache/i.test(error.message) });
  return NextResponse.json({ vacations: data || [] });
}

export async function POST(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const { barberId, startDate, endDate } = body || {};
  if (!barberId || !isDate(startDate) || !isDate(endDate)) return NextResponse.json({ error: "Elige el profesional y las fechas." }, { status: 400 });
  if (endDate < startDate) return NextResponse.json({ error: "La fecha de término no puede ser antes del inicio." }, { status: 400 });
  if (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`) > 366 * 86400000) {
    return NextResponse.json({ error: "El rango no puede superar un año." }, { status: 400 });
  }
  const supabase = createAdminSupabase();
  const { data: pro } = await supabase.from("profiles").select("id").eq("id", barberId).eq("tenant_id", c.tenantId!).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  const { data: me } = await supabase.from("profiles").select("name").eq("id", c.userId).maybeSingle();
  const { error } = await supabase.from("professional_vacations").insert({
    tenant_id: c.tenantId, barber_id: barberId, start_date: startDate, end_date: endDate,
    note: String(body?.note || "").trim().slice(0, 200) || null, created_by: c.userId, created_by_name: me?.name || null,
  });
  if (error) return NextResponse.json({ error: "Falta aplicar la migración 095 en la base de datos." }, { status: 409 });
  // Citas que ya existian en esas fechas (no se tocan: se avisa para que el admin las mueva).
  const { count } = await supabase.from("appointments").select("id", { count: "exact", head: true })
    .eq("barber_id", barberId).gte("date", startDate).lte("date", endDate).in("status", ["scheduled", "confirmed", "in_progress"]);
  return NextResponse.json({ success: true, existingAppointments: count || 0 });
}

export async function DELETE(req: NextRequest) {
  const c = await admin();
  if (!c) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("professional_vacations").delete().eq("id", id).eq("tenant_id", c.tenantId!).select("id");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ success: true });
}
