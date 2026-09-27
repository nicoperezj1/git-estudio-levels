import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase, getCurrentTenantId, resolveTenantForRequest, authorizeBarberManagement } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export async function GET(req: NextRequest) {
  // Use admin client to bypass RLS - barbers list is internal data
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  // Never trust the tenantId coming from the browser — see resolveTenantForRequest.
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));

  // If no tenant, return empty (except super_admin)
  if (!tenantId) {
    return NextResponse.json([]);
  }

  // includeInactive=true lets the team management page show deactivated professionals
  // too, so they can be reactivated or permanently purged (they're invisible otherwise).
  const includeInactive = searchParams.get("includeInactive") === "true";

  let query = supabase
    .from("profiles")
    .select("id, name, email, phone, avatar_url, role, active, also_attends_clients")
    .in("role", ["barber", "receptionist", "admin"])
    .order("name");

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  if (tenantId !== "ALL") {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching barbers:", error.message);
    return NextResponse.json([]);
  }
  return NextResponse.json(data || []);
}

// Punto 14 (Pablo): los links publicos "re-booking.cl/{negocio}/{profesional}" (ver
// barberos/[id]/page.tsx) dependen de que profiles.booking_slug este seteado; si no, la
// UI cae de vuelta al link largo y feo "/pro/{uuid}". La migracion 062 solo rellenaba
// booking_slug una vez, para los profesionales que ya existian en ese momento — nada en
// el codigo de la app lo seteaba para uno nuevo, asi que cualquier profesional creado
// despues de esa migracion quedaba atrapado con el link largo para siempre. Genera un
// slug unico aqui, con el mismo criterio de normalizacion que uso esa migracion en SQL.
async function generateUniqueBookingSlug(adminSupabase: ReturnType<typeof createAdminSupabase>, name: string, userId: string): Promise<string> {
  const base = slugify(name || "profesional");
  let candidate = base;
  let n = 0;
  // Small bound instead of an unbounded loop — collisions this deep are effectively
  // impossible, and a bound keeps a pathological case from hanging the request.
  while (n < 25) {
    const { data: existing } = await adminSupabase
      .from("profiles")
      .select("id")
      .eq("booking_slug", candidate)
      .maybeSingle();
    if (!existing || existing.id === userId) return candidate;
    n += 1;
    candidate = n === 1 ? `${base}-${userId.slice(0, 4)}` : `${base}-${userId.slice(0, 4 + n)}`;
  }
  // Extremely unlikely fallback: the full id guarantees uniqueness.
  return `${base}-${userId}`;
}

export async function POST(req: NextRequest) {
  const adminSupabase = createAdminSupabase();
  const body = await req.json();
  const { name, email, phone, password, tenantId, role } = body;

  // SEGURIDAD: antes no pedia login — cualquiera podia crear usuarios (incluso super_admin).
  const caller = await authorizeBarberManagement(null);
  if (!caller.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const userRole = role || "barber";
  const allowedRoles = caller.role === "super_admin"
    ? ["barber", "receptionist", "admin", "super_admin"]
    : caller.role === "admin" ? ["barber", "receptionist", "admin"] : ["barber"];
  if (!allowedRoles.includes(userRole)) {
    return NextResponse.json({ error: "No puedes crear un usuario con ese rol" }, { status: 403 });
  }
  // Solo super_admin elige negocio; el resto siempre crea en el suyo.
  const tenantForNew = caller.role === "super_admin" ? tenantId : caller.tenantId;

  const tempPassword = password || Math.random().toString(36).slice(-8);

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, role: userRole },
  });

  if (authError) {
    if (authError.message.includes("already") || authError.message.includes("exists")) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email. Usa otro email o edita el profesional existente." }, { status: 409 });
    }
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Update phone and tenant in profile
  if (authData.user) {
    // Resolve tenant_id: prefer param, fallback to session
    let resolvedTenantId = tenantForNew;
    if (!resolvedTenantId) {
      const { getCurrentTenantId } = await import("@/lib/supabase/server");
      resolvedTenantId = await getCurrentTenantId();
      if (resolvedTenantId === "ALL") resolvedTenantId = null; // super_admin without override
    }

    const updates: any = { role: userRole };
    if (phone) updates.phone = phone;
    if (resolvedTenantId) updates.tenant_id = resolvedTenantId;

    const bookingSlug = await generateUniqueBookingSlug(adminSupabase, name, authData.user.id);

    // Use upsert: if trigger already created the profile, update it.
    // If not, create it with all the data.
    const { error: profileError } = await adminSupabase
      .from("profiles")
      .upsert({
        id: authData.user.id,
        name,
        email,
        role: userRole,
        phone: phone || null,
        tenant_id: resolvedTenantId || null,
        active: true,
        booking_slug: bookingSlug,
      }, { onConflict: "id" });

    // If the profile couldn't be created, we'd be left with an orphaned auth user
    // (can log in but has no role/tenant → treated wrong by the app). Roll back the
    // auth user and report the real error instead of returning a false success.
    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json(
        { error: `No se pudo crear el perfil del profesional: ${profileError.message}` },
        { status: 500 }
      );
    }
  }

  // Send welcome email with credentials
  try {
    let businessName = "tu negocio";
    if (tenantId) {
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .single();
      if (tenant?.name) businessName = tenant.name;
    }

    const { sendWelcomeEmail } = await import("@/lib/resend");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://re-booking.cl";
    await sendWelcomeEmail({
      to: email,
      professionalName: name,
      businessName,
      password: tempPassword,
      loginUrl: `${baseUrl}/login`,
    });
  } catch (e) {
    // Don't fail the creation if email fails
    console.error("Error sending welcome email:", e);
  }

  return NextResponse.json(
    { id: authData.user.id, name, email },
    { status: 201 }
  );
}
