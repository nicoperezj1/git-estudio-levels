// Fecha contable ("Corresponde al mes") de los movimientos (migracion 090).
//
// Regla: un movimiento pertenece al mes de `accounting_month`; si esa columna esta vacia (todo lo que
// existia antes) pertenece al mes de su fecha de creacion. Asi un egreso de septiembre registrado en
// octubre aparece en el cierre de septiembre, y nada de lo anterior cambia.
//
// Si la migracion aun no se aplico, `accountingColumnsAvailable` da false y todo se calcula como
// antes (por fecha de creacion): los informes nunca quedan en blanco por una columna que falta.

let known: boolean | null = null;
let recheckAt = 0;

export async function accountingColumnsAvailable(supabase: any): Promise<boolean> {
  if (known === true) return true;
  if (known === false && Date.now() < recheckAt) return false;
  const { error } = await supabase.from("transactions").select("accounting_month, created_by, fixed_category").limit(1);
  known = !error;
  recheckAt = Date.now() + 30_000;
  return known;
}

export interface MonthRange {
  first: string;   // YYYY-MM-DD, dia 1
  last: string;    // YYYY-MM-DD, ultimo dia
  startIso: string; // inicio del mes (instante)
  endIso: string;   // fin del mes
}

// Filtra una consulta de `transactions` al mes pedido segun la regla de arriba.
export function monthFilter(q: any, columnsAvailable: boolean, r: MonthRange, endOp: "lt" | "lte" = "lt") {
  if (!columnsAvailable) {
    return endOp === "lt" ? q.gte("created_at", r.startIso).lt("created_at", r.endIso)
                          : q.gte("created_at", r.startIso).lte("created_at", r.endIso);
  }
  return q.or(
    `and(accounting_month.gte.${r.first},accounting_month.lte.${r.last}),` +
    `and(accounting_month.is.null,created_at.gte.${r.startIso},created_at.${endOp}.${r.endIso})`
  );
}

// "2026-09" -> "2026-09-01". Cualquier otra cosa -> null.
export function monthStart(ym: unknown): string | null {
  if (typeof ym !== "string") return null;
  const m = ym.match(/^(\d{4})-(0[1-9]|1[0-2])(-\d{2})?$/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

export function monthEnd(firstDay: string): string {
  const [y, m] = firstDay.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
}

// Supabase devuelve como maximo 1.000 filas por consulta. Un mes con mas ventas quedaba subestimado
// en los informes. Esto lee por paginas hasta traerlo todo (orden por id: las paginas no se solapan).
export async function fetchAllRows<T = any>(build: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// Movimientos completados de un mes (por fecha contable), todas las filas. Si la consulta por fecha
// contable fallara por cualquier motivo, se reintenta como se hacia antes (por fecha de creacion), para
// que un informe nunca quede en blanco por esto.
export async function fetchMonthTx(
  supabase: any,
  o: { select: string; type: "income" | "expense"; range: MonthRange; scope: (q: any) => any; acc: boolean; endOp?: "lt" | "lte" }
): Promise<any[]> {
  const run = (useAcc: boolean) =>
    fetchAllRows(() =>
      o.scope(
        monthFilter(
          supabase.from("transactions").select(o.select).eq("type", o.type).eq("status", "completed"),
          useAcc, o.range, o.endOp
        )
      )
    );
  try {
    return await run(o.acc);
  } catch (e) {
    console.error("fetchMonthTx:", e);
    if (!o.acc) return [];
    try { return await run(false); } catch { return []; }
  }
}

// ---- Gastos fijos del mes (se guardan como egresos con `fixed_category`) ----
export const FIXED_CATEGORIES = [
  { key: "taxes", label: "Impuestos" },
  { key: "machine_commission", label: "Comisión máquina" },
  { key: "rent", label: "Arriendo / dividendo" },
  { key: "supplies", label: "Insumos" },
  { key: "electricity", label: "Luz" },
  { key: "advertising", label: "Publicidad" },
  { key: "fees", label: "Honorarios / freelance" },
  { key: "equipment", label: "Equipamiento" },
] as const;

// Cierre de mes: el estado vigente es la ultima accion registrada. Sin tabla o sin registros = abierto.
export async function isMonthClosed(supabase: any, tenantId: string | null, firstDay: string): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const { data, error } = await supabase
      .from("month_closings").select("action")
      .eq("tenant_id", tenantId).eq("month", firstDay)
      .order("created_at", { ascending: false }).limit(1);
    if (error) return false;
    return data?.[0]?.action === "close";
  } catch {
    return false;
  }
}

export const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabelEs = (firstDay: string) => `${MONTH_NAMES_ES[parseInt(firstDay.slice(5, 7), 10) - 1]} ${firstDay.slice(0, 4)}`;
