// Distintivo "Nuevo" del calendario.
//
// Un cliente es "Nuevo" cuando esa cita es la PRIMERA que agenda (no tiene ninguna anterior),
// o cuando la cita no esta vinculada a una ficha de cliente (sus datos no estan integrados en
// la base). Las citas canceladas o de "no se presento" no cuentan como visita previa: si agendo
// y cancelo, sigue siendo su primera vez. Ya no depende de que alguien marque la cita como
// "Completada" (antes, quien se cobraba en el POS sin completar la cita salia siempre "Nuevo").
//
// Devuelve el conjunto de ids de cita que son de cliente nuevo.

const PAGE = 1000; // limite por consulta de Supabase; se pagina para no perder historial
const MAX_PAGES = 30;

export async function newClientAppointmentIds(
  supabase: any,
  rows: Array<{ id: string; client_id?: string | null; date: string; start_time?: string | null }>
): Promise<Set<string>> {
  const result = new Set<string>();
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];

  // Sin ficha vinculada: sus datos no estan integrados -> Nuevo.
  for (const r of rows) if (!r.client_id) result.add(r.id);
  if (clientIds.length === 0) return result;

  const maxDate = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  const key = (a: { date: string; start_time?: string | null; id: string }) => `${a.date}|${a.start_time || ""}|${a.id}`;

  // Primera cita (por fecha y hora) de cada cliente, mirando todo su historial hasta hoy.
  const earliest = new Map<string, { id: string; k: string }>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, client_id, date, start_time")
      .in("client_id", clientIds)
      .lte("date", maxDate)
      .not("status", "in", "(cancelled,no_show)")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) break;
    for (const a of data || []) {
      const k = key(a);
      const cur = earliest.get(a.client_id);
      if (!cur || k < cur.k) earliest.set(a.client_id, { id: a.id, k });
    }
    if (!data || data.length < PAGE) break;
  }

  for (const r of rows) {
    if (!r.client_id) continue;
    const first = earliest.get(r.client_id);
    if (!first || first.id === r.id) result.add(r.id);
  }
  return result;
}
