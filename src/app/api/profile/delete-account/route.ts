import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// "Eliminar mi cuenta" (lo exigen Apple y Google). La persona pierde el acceso y sus datos
// personales se borran del perfil. NO se borran los registros del negocio (citas, ventas,
// libro contable): son del negocio y deben conservarse; quedan asociados a "Cuenta eliminada".
// Se confirma con la contrasena. No se puede eliminar al unico administrador de un negocio
// ni a un super admin (eso se hace con soporte).
export async function POST(req: NextRequest) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "Escribe tu contraseña para confirmar." }, { status: 400 });

  if (role === "super_admin") {
    return NextResponse.json({ error: "Las cuentas de la plataforma se cierran con soporte." }, { status: 403 });
  }

  const admin = createAdminSupabase();
  const { data: profile } = await admin.from("profiles").select("email, role, tenant_id").eq("id", userId).maybeSingle();
  if (!profile?.email) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });

  if (role === "admin" && tenantId) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .eq("active", true)
      .neq("id", userId);
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: "Eres el único administrador de tu negocio. Agrega otro administrador o pide a soporte el cierre del negocio." },
        { status: 409 }
      );
    }
  }

  // Confirmar la contrasena con un cliente aparte (no toca la sesion actual).
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: pwError } = await verifier.auth.signInWithPassword({ email: profile.email, password });
  if (pwError) return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 403 });

  // 1) Cerrar el acceso: correo anonimo y cuenta bloqueada. Si falla, no se toca nada mas.
  const placeholderEmail = `eliminado-${userId}@cuenta-eliminada.invalid`;
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    email: placeholderEmail,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { deleted: true },
  });
  if (banError) {
    console.error("[delete-account] no se pudo bloquear el acceso:", banError.message);
    return NextResponse.json({ error: "No se pudo eliminar la cuenta. Inténtalo de nuevo o contacta a soporte." }, { status: 500 });
  }

  // 2) Borrar datos personales del perfil (el perfil queda, inactivo y anonimo, para no romper citas y ventas).
  const { error: profError } = await admin
    .from("profiles")
    .update({ name: "Cuenta eliminada", email: placeholderEmail, phone: null, avatar_url: null, active: false })
    .eq("id", userId);
  if (profError) console.error("[delete-account] perfil no actualizado:", profError.message);

  // Datos opcionales (pueden no existir segun las migraciones aplicadas): se intentan sin romper.
  try { await admin.from("profiles").update({ bio: null, intro_video_url: null }).eq("id", userId); } catch {}
  try { await admin.from("push_subscriptions").delete().eq("user_id", userId); } catch {}

  console.warn(`[delete-account] cuenta ${userId} (rol ${role}) eliminada a peticion de la persona`);
  return NextResponse.json({ ok: true });
}
