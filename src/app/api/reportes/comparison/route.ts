import { accountingColumnsAvailable, fetchMonthTx } from "@/lib/accounting";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";

// Reads from the DB and must never be prerendered/baked at build time.
export const dynamic = "force-dynamic";

// GET: Monthly comparison - last 6 months of income/expenses (scoped to the caller's business)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // Scope every query to the caller's tenant. "ALL" means super_admin (no filter).
  const scoped = (q: any) => (tenantId && tenantId !== "ALL" ? q.eq("tenant_id", tenantId) : q);

  const months: Array<{ month: number; year: number; label: string; income: number; expenses: number }> = [];

  const acc = await accountingColumnsAvailable(supabase);
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const last = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const mr = { first, last, startIso: startDate, endIso: endDate };

    const incomeTx = await fetchMonthTx(supabase, { select: "total", type: "income", range: mr, scope: scoped, acc, endOp: "lte" });
    const expenseTx = await fetchMonthTx(supabase, { select: "total", type: "expense", range: mr, scope: scoped, acc, endOp: "lte" });

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    months.push({
      month,
      year,
      label: `${monthNames[month - 1]} ${year}`,
      income: (incomeTx || []).reduce((s: number, t: any) => s + Number(t.total), 0),
      expenses: (expenseTx || []).reduce((s: number, t: any) => s + Number(t.total), 0),
    });
  }

  return NextResponse.json(months);
}
