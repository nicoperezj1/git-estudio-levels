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
