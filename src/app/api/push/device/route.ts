import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Registro del telefono (app movil) para recibir avisos nativos. Pide sesion: el token siempre se
// asocia a quien esta conectado, nunca a un usuario que mande el navegador.
//   POST   { token, platform: "ios" | "android" }   registra o actualiza el telefono
//   DELETE { token }                                 lo quita (al apagar los avisos o cerrar sesion)

export async function POST(req: NextRequest) {
  const { userId, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform;
  if (token.length < 20 || token.length > 4096) return NextResponse.json({ error: "Token invalido" }, { status: 400 });
  if (platform !== "ios" && platform !== "android") return NextResponse.json({ error: "Plataforma invalida" }, { status: 400 });

  const { error } = await createAdminSupabase()
    .from("device_tokens")
    .upsert({ token, user_id: userId, tenant_id: tenantId, platform, updated_at: new Date().toISOString() }, { onConflict: "token" });
  if (error) {
    console.error("[push/device] no se pudo guardar:", error.message);
    return NextResponse.json({ error: "Falta aplicar la migracion 110 (telefonos de la app)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 400 });

  // Solo se borra si es del usuario conectado.
  await createAdminSupabase().from("device_tokens").delete().eq("token", token).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
