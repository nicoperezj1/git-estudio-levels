import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeProfileAccess } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";


// El slug del profesional es unico POR NEGOCIO (migracion 079), asi el link queda limpio
// (re-booking.cl/mi-salon/javier) aunque otro salon tenga un "javier".
async function uniqueBookingSlugForTenant(
  supabase: ReturnType<typeof createAdminSupabase>,
  name: string,
  userId: string,
  tenantId: string
): Promise<string> {
  const base = slugify(name || "profesional");
  let candidate = base;
  for (let n = 1; n <= 25; n++) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("booking_slug", candidate)
      .maybeSingle();
    if (!existing || existing.id === userId) return candidate;
    candidate = `${base}-${n + 1}`;
  }
  return `${base}-${userId.slice(0, 6)}`;
}

// GET: Get single professional profile
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // SEGURIDAD: antes no pedia sesion y devolvia el perfil completo (PIN y token de MP).
  const access = await authorizeProfileAccess(params.id);
  if (!access.ok) return access.response;

  const supabase = createAdminSupabase();
  const { data: full, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !full) return NextResponse.json({ error: error?.message || "No encontrado" }, { status: 500 });

  // Nunca se entrega el token de Mercado Pago del profesional. El PIN personal solo lo ve
  // el propio profesional o un administrador (la pantalla de perfil lo muestra).
  const { mp_access_token: _mpToken, ...data } = full as Record<string, any>;
  if (access.level === "receptionist") delete (data as any).personal_pin;

  // Link personal corto (re-booking.cl/<negocio>/<profesional>): la UI necesita el slug del
  // negocio y el del profesional. Se devuelven aqui (y se genera el del profesional si aun
  // no existe) para que el link nunca caiga al largo "/pro/<uuid>".
  let bookingSlug: string | null = data.booking_slug ?? null;
  if (!bookingSlug && data.tenant_id) {
    bookingSlug = await uniqueBookingSlugForTenant(supabase, data.name || "profesional", params.id, data.tenant_id);
    await supabase.from("profiles").update({ booking_slug: bookingSlug }).eq("id", params.id);
  }
  let tenantSlug: string | null = null;
  if (data.tenant_id) {
    const { data: t } = await supabase.from("tenants").select("slug").eq("id", data.tenant_id).single();
    tenantSlug = t?.slug ?? null;
  }
  return NextResponse.json({ ...data, booking_slug: bookingSlug, tenant_slug: tenantSlug });
}

// PATCH: Update professional profile (mode, rates, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // SEGURIDAD: antes no pedia sesion (cualquiera podia cambiar PIN, email o comisiones).
  const access = await authorizeProfileAccess(params.id);
  if (!access.ok) return access.response;

  const supabase = createAdminSupabase();
  const body = await req.json();

  // Campos permitidos segun quien edita. Un campo no permitido se ignora.
  const adminFields = [
    "name", "email", "phone", "active", "work_mode",
    "commission_rate", "rental_daily_rate", "rental_min_days",
    "rental_max_days", "rental_deductions", "rental_notes",
    "personal_pin", "avatar_url", "bio", "specialties",
    "intro_video_url", "years_experience", "slot_duration",
    "also_attends_clients", "instagram", "rental_cash_to_barber", "birth_date",
  ];
  // El propio profesional edita su presentacion y su PIN, no su comision ni su estado.
  const selfFields = [
    "phone", "personal_pin", "avatar_url", "bio", "specialties",
    "intro_video_url", "years_experience", "instagram", "birth_date",
  ];
  // Recepcion solo completa los datos de presentacion (ver saveBasic en la ficha).
  const receptionFields = ["bio", "instagram", "avatar_url"];
  const allowedFields =
    access.level === "super_admin" || access.level === "admin"
      ? adminFields
      : access.level === "self"
      ? selfFields
      : receptionFields;

  const update: Record<string, any> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  // Fecha de nacimiento: solo se acepta YYYY-MM-DD; vacio la borra.
  if ("birth_date" in update) {
    const v = update.birth_date;
    update.birth_date = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  }

  // Punto 14 (Pablo): red de seguridad para cualquier profesional que haya quedado sin
  // booking_slug (creado antes de que POST /api/barberos empezara a generarlo). Sin
  // slug, su link personal cae de vuelta al feo "/pro/{uuid}" para siempre. Se genera
  // aqui, de paso, la primera vez que se edita ese profesional — cualquier edicion, no
  // solo un cambio de nombre.
  const { data: current } = await supabase
    .from("profiles")
    .select("booking_slug, name, tenant_id")
    .eq("id", params.id)
    .single();
  if (current && !current.booking_slug && current.tenant_id) {
    update.booking_slug = await uniqueBookingSlugForTenant(
      supabase, update.name || current.name || "profesional", params.id, current.tenant_id
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: Permanently purge a professional (auth account + profile row), freeing up
// their email to be reused. This is NOT the same as "Desactivar" (active=false) — that
// just hides them. Purging is only allowed when the professional has no real business
// history (appointments, sales, commissions, rental records, reviews), so we never
// silently destroy revenue/history data. If they have history, they must stay
// deactivated instead of purged.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // SEGURIDAD: antes no pedia sesion. Solo un admin del mismo negocio (o super_admin).
  const access = await authorizeProfileAccess(params.id);
  if (!access.ok) return access.response;
  if (access.level !== "admin" && access.level !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const barberId = params.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, active")
    .eq("id", barberId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  if (profile.active) {
    return NextResponse.json(
      { error: "Primero debes desactivar al profesional antes de eliminarlo definitivamente." },
      { status: 400 }
    );
  }

  // Check for real business history across every table that references this barber.
  const checks = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("barber_id", barberId),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("barber_id", barberId),
    supabase.from("commissions").select("id", { count: "exact", head: true }).eq("barber_id", barberId),
    supabase.from("rental_records").select("id", { count: "exact", head: true }).eq("barber_id", barberId),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("barber_id", barberId),
  ]);

  const totalHistory = checks.reduce((sum, c) => sum + (c.count || 0), 0);
  if (totalHistory > 0) {
    return NextResponse.json(
      {
        error: `${profile.name} tiene historial real (citas, ventas o comisiones) y no se puede eliminar definitivamente sin perder esos datos. Dejalo desactivado en su lugar.`,
      },
      { status: 409 }
    );
  }

  // Safe to purge: remove the auth account (frees the email) and the profile row.
  // Tables like barber_blocks, gallery, barber_service_assignments and barber_schedule
  // cascade-delete automatically (ON DELETE CASCADE) when the profile row is removed.
  const { error: authError } = await supabase.auth.admin.deleteUser(barberId);
  if (authError && !authError.message.toLowerCase().includes("not found")) {
    return NextResponse.json({ error: `No se pudo eliminar la cuenta: ${authError.message}` }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").delete().eq("id", barberId);
  if (profileError) {
    return NextResponse.json({ error: `No se pudo eliminar el perfil: ${profileError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, purgedEmail: profile.email });
}
