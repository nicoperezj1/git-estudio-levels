// Shared tenant-creation logic. Used by both:
//   - POST /api/superadmin/tenants  (Nico creates a business manually, trial)
//   - POST /api/checkout/subscribe/webhook  (a business self-signs-up and pays, active)
// Extracted so both paths create a tenant the exact same way (settings, subscription,
// admin user, default branch, welcome email) instead of drifting apart.
import { createAdminSupabase } from "@/lib/supabase/server";

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  rutEmpresa?: string | null;
  adminEmail: string;
  adminName?: string | null;
  phone?: string | null;
  address?: string | null;
  plan: string;
  maxProfessionals: number;
  maxBranches: number;
  logoUrl?: string | null;
  website?: string | null;
  socialMedia?: string | null;
  // Trial tenants (manual creation) get a trial period + status "trial".
  // Paid signups (self-serve) get status "active" and a full billing period instead.
  trialDays?: number | null;
  status: "trial" | "active";
  periodDays?: number; // for "active": how long until the subscription needs renewing
  priceClp: number;
  // Recurring subscription (Mercado Pago Preapproval) — only set for paid self-serve
  // signups, not manual trial creation.
  billingPeriod?: "monthly" | "annual";
  mpPreapprovalId?: string | null;
}

export interface ProvisionTenantResult {
  tenant: any;
  tempPassword: string;
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const supabase = createAdminSupabase();

  const tempPassword = Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-4).toUpperCase();

  const now = new Date();
  const periodEnd = new Date(now);
  if (input.status === "trial") {
    periodEnd.setDate(periodEnd.getDate() + (input.trialDays || 15));
  } else {
    periodEnd.setDate(periodEnd.getDate() + (input.periodDays || 30));
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: input.name,
      slug: input.slug,
      rut_empresa: input.rutEmpresa || null,
      plan: input.plan,
      max_professionals: input.maxProfessionals,
      max_branches: input.maxBranches,
      admin_email: input.adminEmail,
      admin_name: input.adminName || input.name,
      temp_password: tempPassword,
      must_change_password: true,
      trial_ends_at: input.status === "trial" ? periodEnd.toISOString() : null,
      status: input.status,
      phone: input.phone || null,
      address: input.address || null,
      logo_url: input.logoUrl || null,
      website: input.website || null,
      social_media: input.socialMedia || null,
    })
    .select()
    .single();

  if (tenantError || !tenant) {
    throw new Error(tenantError?.message || "No se pudo crear el negocio");
  }

  await supabase.from("tenant_settings").insert({ tenant_id: tenant.id });

  await supabase.from("subscriptions").insert({
    tenant_id: tenant.id,
    plan: input.plan,
    status: input.status === "active" ? "active" : "trial",
    amount: input.priceClp,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    billing_period: input.billingPeriod || "monthly",
    payment_gateway: "mercadopago", // columna de la migracion 081 (panel Super Admin)
    mp_preapproval_id: input.mpPreapprovalId || null,
  });

  const { data: authUser } = await supabase.auth.admin.createUser({
    email: input.adminEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (authUser?.user) {
    await supabase.from("profiles").upsert({
      id: authUser.user.id,
      email: input.adminEmail,
      name: input.adminName || input.name,
      role: "admin",
      tenant_id: tenant.id,
      active: true,
    });
  }

  await supabase.from("branches").insert({
    name: `${input.name} - Principal`,
    slug: input.slug,
    tenant_id: tenant.id,
    phone: input.phone || null,
    address: input.address || null,
  });

  try {
    const { getResendClient } = await import("@/lib/resend-client");
    const resend = getResendClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://barberia-kappa-weld.vercel.app";
    const planLabel = input.plan.charAt(0).toUpperCase() + input.plan.slice(1);
    const trialLine = input.status === "trial"
      ? `${planLabel} (${input.trialDays || 15} días gratis)`
      : `${planLabel} (activo)`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@rebooking.cl>",
      to: input.adminEmail,
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
    <p style="color: #1D2433; font-size: 15px;">Hola <strong>${input.adminName || input.name}</strong>,</p>
    <p style="color: #8A94A6; font-size: 14px; line-height: 1.6;">
      Tu cuenta de <strong>${input.name}</strong> está lista. Aqui tienes tus datos de acceso:
    </p>
    <div style="background: #F6F8FB; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>URL:</strong> <a href="${appUrl}/login" style="color: #1E88E5;">${appUrl}/login</a></p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Email:</strong> ${input.adminEmail}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Contrasena temporal:</strong> <code style="background: #1E88E5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
      <p style="margin: 4px 0; font-size: 14px; color: #1D2433;"><strong>Plan:</strong> ${trialLine}</p>
    </div>
    <p style="color: #8A94A6; font-size: 13px;">Al ingresar por primera vez te pediremos cambiar tu contrasena.</p>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${appUrl}/login" style="display: inline-block; background: #1E88E5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: bold; font-size: 14px;">Ingresar al sistema</a>
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

  return { tenant, tempPassword };
}
