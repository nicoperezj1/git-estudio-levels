import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, requireRole } from "@/lib/supabase/server";

// POST: Log a login session
export async function POST(req: NextRequest) {
  // SEGURIDAD: antes se aceptaba cualquier userId sin sesion (se podia falsificar el historial).
  // Ahora el registro es siempre de quien tiene la sesion iniciada.
  const guard = await requireRole(["super_admin", "admin", "receptionist", "barber", "client"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const { userEmail, device, browser } = await req.json();
  const userId = guard.userId;
  const { data: me } = await supabase.from("profiles").select("name, role").eq("id", userId).maybeSingle();
  const userName: string | null = me?.name || null;
  const userRole: string | null = me?.role || guard.role;

  // Get IP from headers
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
             req.headers.get("x-real-ip") || 
             "unknown";

  await supabase.from("login_sessions").insert({
    user_id: userId,
    user_name: userName || null,
    user_email: userEmail || null,
    user_role: userRole || null,
    device: device || "unknown",
    browser: browser || "unknown",
    ip_address: ip,
  });

  return NextResponse.json({ success: true });
}

// GET: List sessions (for admin view)
export async function GET(req: NextRequest) {
  // SEGURIDAD: antes listaba IP, correo y rol de todos los usuarios sin pedir sesion.
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const limit = parseInt(searchParams.get("limit") || "50");

  let query = supabase
    .from("login_sessions")
    .select("*")
    .order("logged_in_at", { ascending: false })
    .limit(limit);

  if (userId) query = query.eq("user_id", userId);

  const { data } = await query;
  return NextResponse.json(data || []);
}
