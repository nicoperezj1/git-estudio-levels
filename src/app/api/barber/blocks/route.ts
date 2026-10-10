import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { vacationDates } from "@/lib/vacations";

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");
  const month = searchParams.get("month"); // YYYY-MM

  if (!barberId) return NextResponse.json([]);

  let query = supabase
    .from("barber_blocks")
    .select("*")
    .eq("barber_id", barberId)
    .order("date", { ascending: true });

  if (month) {
    // Use the REAL last day of the month. This used to hardcode `${month}-31`, which is
    // an invalid date for 30-day months (April, June, September, November) and February.
    // Postgres rejects the comparison, the whole query errors out, and the endpoint
    // returned an empty list — so blocks silently never showed up in those months.
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this one
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("date", startDate).lte("date", endDate);
  }

  const { data, error } = await query;
  if (error) {
    // Don't swallow it: an error here previously looked identical to "no blocks".
    console.error("[barber/blocks] query failed:", error.message);
    return NextResponse.json([]);
  }
  // Las vacaciones (Mi negocio > Vacaciones) se muestran como bloqueos de todo el dia ("Vacaciones").
  // Son solo de lectura: se cambian en la pagina de Vacaciones.
  let result: any[] = data || [];
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dates = await vacationDates(supabase, barberId, `${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`);
    result = [...result, ...dates.map((d) => ({
      id: `vac-${barberId}-${d}`, barber_id: barberId, date: d, all_day: true, start_time: null, end_time: null, reason: "Vacaciones", is_vacation: true,
    }))];
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { barberId, date, allDay, startTime, endTime, reason } = body;
  const spots = Number.isInteger(body.spots) && body.spots >= 1 && body.spots <= 6 && allDay === false ? body.spots : null;

  const row: Record<string, any> = {
    barber_id: barberId,
    date,
    all_day: allDay !== false,
    start_time: allDay ? null : startTime,
    end_time: allDay ? null : endTime,
    reason: reason || null,
  };
  let { data, error } = await supabase.from("barber_blocks").insert(spots ? { ...row, spots } : row).select().single();
  // Falta la migracion 102: no se puede guardar un bloqueo parcial; se avisa en vez de bloquear todo.
  if (error && spots && /spots/.test(error.message)) {
    return NextResponse.json({ error: "Falta aplicar la migración 102 para bloquear solo algunos cupos" }, { status: 500 });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// Punto (Nico, 25-sep): antes un bloqueo solo se podia eliminar (la X roja en el
// calendario) — Pablo pidio poder modificar nombre/duracion sin tener que borrar y
// recrear. Mismo shape que POST, pero solo actualiza los campos recibidos.
export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));
  const { reason, allDay, startTime, endTime } = body;

  const updates: Record<string, any> = {};
  if (body.spots !== undefined) updates.spots = Number.isInteger(body.spots) && body.spots >= 1 && body.spots <= 6 ? body.spots : null;
  if (reason !== undefined) updates.reason = reason || null;
  if (allDay !== undefined) {
    updates.all_day = !!allDay;
    updates.start_time = allDay ? null : startTime || null;
    updates.end_time = allDay ? null : endTime || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  if (updates.all_day === true) updates.spots = null;
  const { data, error } = await supabase
    .from("barber_blocks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error && /spots/.test(error.message)) {
    return NextResponse.json({ error: "Falta aplicar la migración 102 para bloquear solo algunos cupos" }, { status: 500 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  await supabase.from("barber_blocks").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
