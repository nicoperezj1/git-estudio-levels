import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeProfileAccess, requireRole } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // SEGURIDAD: antes no pedia sesion: con el email o id de cualquier cuenta (incluida la de un
  // super_admin) se le cambiaba la contrasena y se enviaba a un correo elegido por quien llamaba.
  // Ahora solo un admin del mismo negocio (o super_admin) y siempre al correo del propio perfil.
  const guard = await requireRole(["admin", "super_admin"]);
  if (!guard.ok) return guard.response;

  const supabase = createAdminSupabase();
  const { email, name, profileId } = await req.json();

  if (!email && !profileId) {
    return NextResponse.json({ error: "Email o profileId requerido" }, { status: 400 });
  }

  // Generate a new temporary password
  const { randomBytes } = await import("crypto");
  const tempPassword = randomBytes(9).toString("base64url") + "A1";

  // Resolve the profile. Prefer the profileId (the barber's own row that the ficha
  // already knows) over the email lookup — email + .single() was fragile: it failed both
  // when no row matched AND when duplicates existed, surfacing the misleading "no tiene
  // cuenta activa" even though the profile was open on screen. That was Javier's case.
  let resolvedId: string | null = profileId || null;
  if (!resolvedId && email) {
    // maybeSingle avoids throwing on duplicates; take the first match.
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", String(email).trim())
      .limit(1);
    resolvedId = data && data.length > 0 ? data[0].id : null;
  }
  if (!resolvedId) {
    return NextResponse.json({ error: "No se encontro el perfil de este profesional." }, { status: 404 });
  }

  // El perfil debe ser del negocio de quien lo pide (super_admin: cualquiera).
  const access = await authorizeProfileAccess(resolvedId);
  if (!access.ok) return access.response;
  if (access.level !== "admin" && access.level !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email")
    .eq("id", resolvedId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "No se encontro el perfil de este profesional." }, { status: 404 });
  }

  // Las credenciales siempre van al correo registrado en el perfil (nunca a uno elegido
  // por quien llama). Si el perfil no tiene correo, se usa el enviado solo para esa cuenta.
  const targetEmail = (profile.email || email || "").trim();
  if (!targetEmail) {
    return NextResponse.json({ error: "Este profesional no tiene un correo registrado. Agregalo primero en su ficha." }, { status: 400 });
  }

  // Try to set the password on the existing auth user. If there is NO auth user for this
  // profile yet (profile created without a login account — exactly why "Enviar
  // credenciales" said "no tiene cuenta activa"), create the auth account instead of
  // failing. The auth user id must match the profile id so the app links them.
  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
    password: tempPassword,
    email_confirm: true,
  });

  if (updateError) {
    const notFound = /not.*found|no user|does not exist/i.test(updateError.message || "");
    if (notFound) {
      // No login account yet → create one and confirm the email so they can sign in now.
      const { error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: name || "Profesional" },
      });
      if (createError) {
        return NextResponse.json({ error: `No se pudo crear la cuenta: ${createError.message}` }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Get tenant name for the email
  let businessName = "re-booking";
  if (profile.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .single();
    if (tenant?.name) businessName = tenant.name;
  }

  // Send the credentials email
  try {
    const { sendWelcomeEmail } = await import("@/lib/resend");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";
    await sendWelcomeEmail({
      to: targetEmail,
      professionalName: name || "Profesional",
      businessName,
      password: tempPassword,
      loginUrl: `${baseUrl}/login`,
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error enviando email" }, { status: 500 });
  }
}
