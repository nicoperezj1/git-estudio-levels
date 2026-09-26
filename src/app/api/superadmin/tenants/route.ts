import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// SEGURIDAD (Nico, 25-sep): esta ruta lista/crea TODAS las empresas de la plataforma
// (no solo la del que llama) y antes no verificaba el rol en el servidor — cualquiera
// autenticado podia listar el resto de los negocios. Se agrega el mismo guard que se usa
// en el resto de las rutas de Superadmin.
async function requireSuperAdmin() {
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

// GET: List all tenants
export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const supabase = createAdminSupabase();

  const { data: tenants } = await supabase
    .from("tenants")
    .select(`
      *,
      subscription:subscriptions(plan, status, current_period_end)
    `)
    .order("created_at", { ascending: false });

  return NextResponse.json(tenants || []);
}

// POST: Create new tenant (business)
export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const supabase = createAdminSupabase();
  const body = await req.json();
  const { name, slug, rut_empresa, admin_email, admin_name, phone, address, plan, logo_url, website, social_media, trial_days, max_professionals } = body;

  // Validations
  if (!name || !slug || !admin_email) {
    return NextResponse.json({ error: "name, slug y admin_email son obligatorios" }, { status: 400 });
  }

  // Punto 22 (Pablo): periodo de prueba configurable al crear el negocio (antes 15 dias
  // fijo). Se acota a un rango razonable para evitar un valor invalido/negativo.
  const trialDays = Number.isFinite(Number(trial_days)) && Number(trial_days) > 0
    ? Math.min(Math.round(Number(trial_days)), 365)
    : 15;

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug solo puede tener letras minusculas, numeros y guiones" }, { status: 400 });
  }

  // Check slug unique
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Ese identificador ya esta en uso" }, { status: 409 });
  }

  // Generate temp password
  const tempPassword = Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-4).toUpperCase();

  // Plan limits
  const selectedPlan = plan || "starter";
  const { data: planConfig } = await supabase
    .from("plan_limits")
    .select("max_professionals, max_branches, price_clp")
    .eq("plan", selectedPlan)
    .single();

  // Pedido de Nico (26-sep): esta ruta solo la puede llamar super_admin (ver
  // requireSuperAdmin arriba), asi que se permite desacoplar el limite de profesionales
  // del plan elegido — ej. crear un negocio en plan Pro pero con solo 1-2 profesionales
  // (para probar), o en plan Basic con 10 (un caso especial acordado con el cliente). Si
  // no se manda max_professionals, se usa el default del plan como siempre.
  const overrideMaxProfessionals = Number(max_professionals);
  const maxProfessionals = Number.isFinite(overrideMaxProfessionals) && overrideMaxProfessionals > 0
    ? Math.round(overrideMaxProfessionals)
    : (planConfig?.max_professionals || 3);
  const maxBranches = planConfig?.max_branches || 1;

  // Trial: configurable, 15 dias por defecto.
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + trialDays);

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name,
      slug,
      rut_empresa: rut_empresa || null,
      plan: selectedPlan,
      max_professionals: maxProfessionals,
      max_branches: maxBranches,
      admin_email,
      admin_name: admin_name || name,
      temp_password: tempPassword,
      must_change_password: true,
      trial_ends_at: trialEnds.toISOString(),
      status: "trial",
      phone: phone || null,
      address: address || null,
      logo_url: logo_url || null,
      website: website || null,
      social_media: social_media || null,
    })
    .select()
    .single();

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }

  // Create default settings
  await supabase.from("tenant_settings").insert({ tenant_id: tenant.id });

  // Create subscription (trial)
  await supabase.from("subscriptions").insert({
    tenant_id: tenant.id,
    plan: selectedPlan,
    status: "trial",
    amount: planConfig?.price_clp || 0,
    current_period_start: new Date().toISOString(),
    current_period_end: trialEnds.toISOString(),
  });

  // Create auth user for the tenant admin
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: admin_email,
    password: tempPassword,
    email_confirm: true,
  });

  // Create profile linked to tenant
  if (authUser?.user) {
    await supabase.from("profiles").upsert({
      id: authUser.user.id,
      email: admin_email,
      name: admin_name || name,
      role: "admin",
      tenant_id: tenant.id,
      active: true,
    });
  }

  // Create default branch for tenant
  await supabase.from("branches").insert({
    name: `${name} - Principal`,
    slug: slug,
    tenant_id: tenant.id,
    phone: phone || null,
    address: address || null,
  });

  // Send welcome email
  try {
    const { getResendClient } = await import("@/lib/resend-client");
    const resend = getResendClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://barberia-kappa-weld.vercel.app";

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
      to: admin_email,
      subject: `Bienvenido a re-booking — Tus datos de acceso`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #F6F8FB;">
  <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #1D2433; margin: 0; font-size: 24px;">Bienvenido a re-booking</h1>
      <p style="color: #8A94A6; margin: 8px 0 0; font-size: 14px;">Todo tu negocio. Un solo sistema.</p>
    </div>

    <p style="color: #1D2433; font-size: 15px;">Hola <strong>${admin_name || name}</strong>,</p>
    <p style="color: #8A94A6; font-size: 14px; line-height: 1.6;">
      Tu cuenta de <strong>${name}</strong> esta lista. Aqui tienes tus datos de acceso:
    </p>

    <div style="background: #F6F8FB; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>URL:</strong> <a href="${appUrl}/login" style="color: #1E88E5;">${appUrl}/login</a></p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Email:</strong> ${admin_email}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Contrasena temporal:</strong> <code style="background: #1E88E5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Plan:</strong> ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} (${trialDays} dias gratis)</p>
    </div>

    <p style="color: #8A94A6; font-size: 13px;">
      Al ingresar por primera vez te pediremos cambiar tu contrasena.
    </p>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${appUrl}/login" style="display: inline-block; background: #1E88E5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: bold; font-size: 14px;">
        Ingresar al sistema
      </a>
    </div>

    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #8A94A6; font-size: 11px; margin: 0;">re-booking · rebooking.cl</p>
    </div>
  </div>
</body>
</html>`,
    });
  } catch (e) {
    console.error("Error sending welcome email:", e);
  }

  return NextResponse.json({
    tenant,
    temp_password: tempPassword,
    message: `Empresa creada. Trial de ${trialDays} dias activo.`,
    login_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://barberia-kappa-weld.vercel.app"}/login`,
  }, { status: 201 });
}
