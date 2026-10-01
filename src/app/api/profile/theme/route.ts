import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// POST: cada usuario elige SU tema (claro/oscuro) o vuelve al del negocio (theme = null).
// Solo toca el perfil del usuario logueado; nunca recibe un id desde el cliente.
export async function POST(req: NextRequest) {
  const { userId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const theme = body.theme === "dark" ? "dark" : body.theme === "light" ? "light" : null;

  const { error } = await createAdminSupabase().from("profiles").update({ theme }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, theme });
}
