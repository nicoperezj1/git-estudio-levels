import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeBarberManagement } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { email, name, profileId } = await req.json();

  if (!email && !profileId) {
    return NextResponse.json({ error: "Email o profileId requerido" }, { status: 400 });
  }

  // Generate a new temporary password
  const tempPassword = Math.random().toString(36).slice(-8) + "A1";

  // Resolve the profile. Prefer the profileId (the barber's own row that the ficha
  // already knows) over the email lookup — email + .single() was fragile: it failed both
  // when no row matched AND when duplicates existed, surfacing the misleading "no tiene
  // cuenta activa" even though the profile was open on screen. That was Javier's case.
  let profile: { id: string; tenant_id: string | null; email: string | null } | null = null;
  if (profileId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, tenant_id, email")
      .eq("id", profileId)
      .maybeSingle();
    profile = data;
  }
  if (!profile && email) {
    // maybeSingle avoids throwing on duplicates; take the first match.
    const { data } = await supabase
      .from("profiles")
      .select("id, tenant_id, email")
      .ilike("email", email.trim())
      .limit(1);
    profile = data && data.length > 0 ? data[0] : null;
  }

  if (!profile) {
    return NextResponse.json({ error: "No se encontro el perfil de este profesional." }, { status: 404 });
  }

  // SEGURIDAD: antes cualquiera podia resetear la clave de cualquier usuario.
  const auth = await authorizeBarberManagement(profile.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const targetEmail = (email || profile.email || "").trim();
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
