import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminSupabase();
  const body = await req.json();

  // Build update object dynamically
  const update: Record<string, any> = {};
  if (body.status) update.status = body.status;
  if (body.barber_id) update.barber_id = body.barber_id;
  if (body.start_time) update.start_time = body.start_time;
  if (body.end_time) update.end_time = body.end_time;
  if (body.date) update.date = body.date;
  if (body.notes !== undefined) update.notes = body.notes;

  // Cambiar los servicios de la cita (Nico, 29-sep): reemplaza appointment_services con los
  // servicios elegidos (precio tomado del catalogo) y, si adjust_end, recalcula la hora de
  // termino segun la duracion total nueva.
  if (Array.isArray(body.service_ids) && body.service_ids.length > 0) {
    const { data: svcs, error: svcErr } = await supabase
      .from("services")
      .select("id, price, duration")
      .in("id", body.service_ids);
    if (svcErr || !svcs || svcs.length === 0) {
      return NextResponse.json({ error: "Servicios no encontrados" }, { status: 400 });
    }
    const { error: delErr } = await supabase.from("appointment_services").delete().eq("appointment_id", params.id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await supabase
      .from("appointment_services")
      .insert(svcs.map((sv: any) => ({ appointment_id: params.id, service_id: sv.id, price: sv.price })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    if (body.adjust_end && !body.end_time) {
      const { data: cur } = await supabase.from("appointments").select("start_time").eq("id", params.id).single();
      const startIso = body.start_time || cur?.start_time;
      if (startIso) {
        const total = svcs.reduce((n: number, sv: any) => n + (sv.duration || 0), 0);
        update.end_time = new Date(new Date(startIso).getTime() + total * 60000).toISOString();
      }
    }
  }

  if (Object.keys(update).length === 0) {
    const { data: same, error: sameErr } = await supabase.from("appointments").select().eq("id", params.id).single();
    if (sameErr) return NextResponse.json({ error: sameErr.message }, { status: 500 });
    return NextResponse.json(same);
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
