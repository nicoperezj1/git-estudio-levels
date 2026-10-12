import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Cambiar el correo de ingreso. Solo super admin (cuenta de la plataforma). Se confirma con la contrasena
// actual y se actualiza el acceso (auth) y el perfil a la vez, para que el login siga funcionando.
export async function POST(req: NextRequest) {
  const { userId, role } = await getCurrentUserRoleAndTenant();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  if (!password) return NextResponse.json({ error: "Escribe tu contraseña actual para confirmar." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ error: "El correo nuevo no es válido." }, { status: 400 });

  const admin = createAdminSupabase();
  const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!profile?.email) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });
  if (profile.email.toLowerCase() === newEmail) return NextResponse.json({ error: "Ese ya es tu correo." }, { status: 400 });

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: pwError } = await verifier.auth.signInWithPassword({ email: profile.email, password });
  if (pwError) return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 403 });

  const { data: taken } = await admin.from("profiles").select("id").ilike("email", newEmail).neq("id", userId).limit(1);
  if (taken && taken.length > 0) return NextResponse.json({ error: "Ese correo ya lo usa otra cuenta." }, { status: 409 });

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
  if (authErr) {
    console.error("[change-email] auth:", authErr.message);
    return NextResponse.json({ error: "No se pudo cambiar el correo (puede estar en uso)." }, { status: 400 });
  }
  const { error: profErr } = await admin.from("profiles").update({ email: newEmail }).eq("id", userId);
  if (profErr) {
    // Deshacer el cambio de acceso para no dejar el correo desfasado.
    await admin.auth.admin.updateUserById(userId, { email: profile.email, email_confirm: true });
    console.error("[change-email] perfil:", profErr.message);
    return NextResponse.json({ error: "No se pudo actualizar el perfil. No se cambió nada." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
