import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";

// GET: cumpleanos del mes del equipo (Dashboard > "Cumpleanos del mes").
// Solo administradores: la fecha de nacimiento es un dato personal del equipo.
// ?month=1-12 opcional (por defecto, el mes actual en Chile).
export async function GET(req: NextRequest) {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ month: null, birthdays: [] });
  }

  const [todayY, todayM, todayD] = todayInChile().split("-").map(Number);
  const monthParam = parseInt(searchParams.get("month") || "", 10);
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : todayM;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, avatar_url, role, birth_date")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .not("birth_date", "is", null);
  if (error) return NextResponse.json({ month, birthdays: [] });

  const birthdays = (data || [])
    .map((p: any) => {
      const [y, m, d] = String(p.birth_date).split("-").map(Number);
      return { id: p.id, name: p.name, avatar_url: p.avatar_url, role: p.role, day: d, month: m, age: todayY - y };
    })
    .filter((p) => p.month === month)
    .sort((a, b) => a.day - b.day)
    .map((p) => ({ ...p, isToday: month === todayM && p.day === todayD, daysUntil: month === todayM ? p.day - todayD : null }));

  return NextResponse.json({ month, birthdays });
}
