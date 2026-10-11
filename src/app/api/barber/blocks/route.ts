import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, canAccessBarber } from "@/lib/supabase/server";
import { expandRepeat, isValidDate } from "@/lib/recurrence";
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
  if (!barberId || !(await canAccessBarber(barberId))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const spots = Number.isInteger(body.spots) && body.spots >= 1 && body.spots <= 6 && allDay === false ? body.spots : null;

  const base: Record<string, any> = {
    barber_id: barberId,
    all_day: allDay !== false,
    start_time: allDay ? null : startTime,
    end_time: allDay ? null : endTime,
    reason: reason || null,
    ...(spots ? { spots } : {}),
  };

  // Bloqueo repetido: una fila por fecha, todas con el mismo series_id (migracion 106) para poder borrar la serie.
  if (body.repeat && isValidDate(date)) {
    const dates = expandRepeat(date, body.repeat);
    if (dates.length === 0) return NextResponse.json({ error: "La repetición no es válida" }, { status: 400 });
    const seriesId = crypto.randomUUID();
    const rows = dates.map((d) => ({ ...base, date: d, series_id: seriesId }));
    let { error } = await supabase.from("barber_blocks").insert(rows);
    if (error && /series_id/.test(error.message)) {
      // Falta la migracion 106: se crean igual, pero no se podran borrar todas juntas.
      ({ error } = await supabase.from("barber_blocks").insert(rows.map(({ series_id: _s, ...r }) => r)));
    }
    if (error && spots && /spots/.test(error.message)) {
      return NextResponse.json({ error: "Falta aplicar la migración 102 para bloquear solo algunos cupos" }, { status: 500 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: dates.length, seriesId }, { status: 201 });
  }

  let { data, error } = await supabase.from("barber_blocks").insert({ ...base, date }).select().single();
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

// DELETE ?id=...            -> solo ese bloqueo
//        ?id=...&scope=following -> ese y los siguientes de su serie
//        ?id=...&scope=series    -> toda la serie (si el bloqueo no es de una serie, solo ese)
export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const scope = searchParams.get("scope");

  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const { data: row } = await supabase.from("barber_blocks").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ success: true });
  if (!(await canAccessBarber((row as any).barber_id))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const seriesId = (row as any).series_id;
  if (seriesId && (scope === "series" || scope === "following")) {
    let q = supabase.from("barber_blocks").delete().eq("series_id", seriesId);
    if (scope === "following") q = q.gte("date", (row as any).date);
    await q;
    return NextResponse.json({ success: true });
  }

  await supabase.from("barber_blocks").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
