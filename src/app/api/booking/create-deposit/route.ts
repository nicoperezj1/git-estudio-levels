import { isTenantSuspended, isBarberTenantSuspended, TENANT_SUSPENDED_MESSAGE } from "@/lib/tenant-suspension";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Creates a MercadoPago Checkout Pro preference for a booking deposit.
 * The client pays online, then gets redirected back with status.
 * 
 * Flow:
 * 1. Booking page calls this with appointment details
 * 2. We create the appointment with status "pending_payment"
 * 3. We create a MP preference (checkout link)
 * 4. Client pays on MP
 * 5. Webhook confirms → appointment changes to "confirmed"
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const {
    barberId,
    clientName,
    clientEmail,
    clientPhone,
    serviceIds,
    date,
    startTime,
    totalPrice,
    notes,
  } = body;

  if (!barberId || !serviceIds?.length || !date || !startTime || !clientName || !totalPrice) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Get barber's tenant to find MP credentials and deposit config
  const { data: barber } = await supabase
    .from("profiles")
    .select("tenant_id, name")
    .eq("id", barberId)
    .single();

  if (!barber?.tenant_id) {
    return NextResponse.json({ error: "Profesional sin negocio asignado" }, { status: 400 });
  }
  if (await isTenantSuspended(supabase, barber.tenant_id)) {
    return NextResponse.json({ error: TENANT_SUSPENDED_MESSAGE, code: "tenant_suspended" }, { status: 403 });
  }

  // Get tenant settings (deposit config + MP token)
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("deposit_percentage, deposit_message, mp_access_token, cancellation_free_hours")
    .eq("tenant_id", barber.tenant_id)
    .single();

  if (!settings?.mp_access_token) {
    return NextResponse.json({ error: "MercadoPago no configurado para este negocio" }, { status: 400 });
  }

  // Calculate deposit amount
  const depositPercentage = settings.deposit_percentage || 30;
  const depositAmount = Math.ceil(totalPrice * depositPercentage / 100);

  // Get tenant name for display
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", barber.tenant_id)
    .single();

  // Get service names for description
  const { data: services } = await supabase
    .from("services")
    .select("name")
    .in("id", serviceIds);

  const serviceNames = (services || []).map((s) => s.name).join(" + ");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://re-booking.cl";

  // Create MP Checkout Pro preference
  const preferenceRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.mp_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [{
        title: `Abono - ${serviceNames}`,
        description: `Reserva con ${barber.name} en ${tenant?.name || "re-booking"}`,
        quantity: 1,
        currency_id: "CLP",
        unit_price: depositAmount,
      }],
      payer: {
        name: clientName,
        email: clientEmail || undefined,
      },
      back_urls: {
        success: `${baseUrl}/booking/deposit-success`,
        failure: `${baseUrl}/booking/deposit-failure`,
        pending: `${baseUrl}/booking/deposit-pending`,
      },
      auto_return: "approved",
      external_reference: JSON.stringify({
        barberId,
        clientName,
        clientEmail,
        clientPhone,
        serviceIds,
        date,
        startTime,
        notes,
        totalPrice,
        depositAmount,
        tenantId: barber.tenant_id,
      }),
      notification_url: `${baseUrl}/api/webhooks/deposit`,
      statement_descriptor: tenant?.name || "RE-BOOKING",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min to pay
    }),
  });

  const preferenceData = await preferenceRes.json();

  if (!preferenceRes.ok) {
    console.error("MP Preference error:", preferenceData);
    return NextResponse.json({ error: "Error creando link de pago" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    checkoutUrl: preferenceData.init_point,
    depositAmount,
    depositPercentage,
    preferenceId: preferenceData.id,
  });
}
