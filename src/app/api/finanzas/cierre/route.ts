import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { isMonthClosed, monthLabelEs, monthStart } from "@/lib/accounting";

// Cerrar / reabrir un mes (solo administrador). Cerrado = no se pueden registrar, editar ni anular
// movimientos manuales que correspondan a ese mes ni cambiar sus gastos fijos; las ventas del POS
// nunca se bloquean. Cada cambio queda en el registro (quien y cuando).

async function requireAdmin() {
  const { role, userId } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const;
  return { userId } as const;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const month = monthStart(searchParams.get("month"));
  if (denied || !tenantId || tenantId === "ALL" || !month) return NextResponse.json({ error: "Negocio o mes no valido" }, { status: 400 });

  const closed = await isMonthClosed(supabase, tenantId, month);
  const { data: log, error } = await supabase
    .from("month_closings").select("action, user_name, created_at")
    .eq("tenant_id", tenantId).eq("month", month).order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ available: !error, closed, log: log || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  const body = await req.json().catch(() => null);
  const month = monthStart(body?.month);
  const action = body?.action;
  if (denied || !tenantId || tenantId === "ALL" || !month || (action !== "close" && action !== "reopen")) {
    return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  }

  const closed = await isMonthClosed(supabase, tenantId, month);
  if (action === "close" && closed) return NextResponse.json({ error: `${monthLabelEs(month)} ya esta cerrado.` }, { status: 409 });
  if (action === "reopen" && !closed) return NextResponse.json({ error: `${monthLabelEs(month)} ya esta abierto.` }, { status: 409 });

  const { data: me } = await supabase.from("profiles").select("name").eq("id", auth.userId).maybeSingle();
  const { error } = await supabase.from("month_closings").insert({
    tenant_id: tenantId, month, action, user_id: auth.userId, user_name: me?.name || null,
  });
  if (error) return NextResponse.json({ error: "Falta aplicar la migracion 090 en la base de datos." }, { status: 409 });
  return NextResponse.json({ success: true, closed: action === "close" });
}
