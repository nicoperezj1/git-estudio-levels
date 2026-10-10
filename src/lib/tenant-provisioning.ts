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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.re-booking.cl";
    const planLabel = input.plan.charAt(0).toUpperCase() + input.plan.slice(1);
    const trialLine = input.status === "trial"
      ? `${planLabel} (${input.trialDays || 15} días gratis)`
      : `${planLabel} (activo)`;

    const esc = (v: string) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const adminName = esc(input.adminName || input.name);
    const businessName = esc(input.name);

    // Mismo estilo que el resto de los correos de re-booking (encabezado verde con logo blanco).
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "re-booking <no-reply@re-booking.cl>",
      to: input.adminEmail,
      subject: `Bienvenido a re-booking — Tus datos de acceso`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #F5F7FA; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #0F8B8D, #2EC4B6); padding: 32px 24px; text-align: center;">
      <img src="https://re-booking.cl/logo-horizontal-white.png" alt="re-booking" style="height: 32px; max-width: 240px; object-fit: contain; margin-bottom: 14px;" />
      <h1 style="color: white; margin: 0; font-size: 22px;">Bienvenido a re-booking</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Todo tu negocio. Un solo sistema.</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #1F2937; font-size: 15px; margin: 0 0 20px;">Hola <strong>${adminName}</strong>,</p>
      <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Tu cuenta de <strong>${businessName}</strong> ya está lista. Estos son tus datos para ingresar:
      </p>

      <div style="background: #F5F7FA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #6B7280; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Tus credenciales</p>
        <p style="color: #1F2937; font-size: 14px; margin: 0 0 6px;"><strong>Email:</strong> ${esc(input.adminEmail)}</p>
        <p style="color: #1F2937; font-size: 14px; margin: 0 0 6px;"><strong>Contraseña temporal:</strong> <span style="font-family: monospace; font-size: 15px; background: #E6F4F4; color: #0F8B8D; padding: 2px 8px; border-radius: 6px;">${tempPassword}</span></p>
        <p style="color: #1F2937; font-size: 14px; margin: 0;"><strong>Plan:</strong> ${esc(trialLine)}</p>
      </div>

      <a href="${appUrl}/login" style="display: block; text-align: center; background: #0F8B8D; color: white; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Ingresar al sistema
      </a>

      <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 20px 0 0;">
        Al ingresar por primera vez te pediremos crear tu propia contraseña.
      </p>
    </div>
    <div style="border-top: 1px solid #F3F4F6; padding: 16px 24px; text-align: center;">
      <p style="color: #9CA3AF; font-size: 11px; margin: 0;">re-booking · Todo tu negocio. Un solo sistema.</p>
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
