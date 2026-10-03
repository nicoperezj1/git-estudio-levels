// Retiros de efectivo a la caja fuerte (migracion 094). Se restan del efectivo esperado del dia.
// Si la migracion aun no esta aplicada, todo funciona como siempre (retiros = 0).
import type { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;

export interface Withdrawal { id: string; amount: number; note: string | null; created_by_name: string | null; created_at: string }

export async function getWithdrawals(supabase: Admin, tenantId: string, day: string): Promise<{ total: number; rows: Withdrawal[] }> {
  const { data, error } = await supabase
    .from("cash_withdrawals")
    .select("id, amount, note, created_by_name, created_at")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .order("created_at", { ascending: true });
  if (error) return { total: 0, rows: [] };
  const rows = (data || []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as Withdrawal[];
  return { total: rows.reduce((s, r) => s + r.amount, 0), rows };
}

// Tope de efectivo del negocio (NULL / columna inexistente = sin tope).
export async function getCashCap(supabase: Admin, tenantId: string): Promise<number | null> {
  const { data, error } = await supabase.from("tenants").select("cash_cap").eq("id", tenantId).maybeSingle();
  if (error) return null;
  const n = Number((data as any)?.cash_cap);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Ajustes de caja (migracion 097): lo que el administrador declara como efectivo real tras revisar un reporte.
export interface Adjustment { id: string; amount: number; note: string; created_by_name: string | null; created_at: string; declared_cash: number | null }

export async function getAdjustments(supabase: Admin, tenantId: string, day: string): Promise<{ total: number; rows: Adjustment[] }> {
  const { data, error } = await supabase
    .from("cash_adjustments")
    .select("id, amount, note, created_by_name, created_at, declared_cash")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .order("created_at", { ascending: true });
  if (error) return { total: 0, rows: [] };
  const rows = (data || []).map((r: any) => ({ ...r, amount: Number(r.amount), declared_cash: r.declared_cash != null ? Number(r.declared_cash) : null })) as Adjustment[];
  return { total: rows.reduce((s, r) => s + r.amount, 0), rows };
}
