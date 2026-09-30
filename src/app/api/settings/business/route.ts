import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { BUSINESS_CATEGORY_VALUES } from "@/lib/business-categories";

// POST: Save business profile (name/phone/address) and weekly business hours.
//
// This used to be done straight from the browser with the client Supabase
// (supabase.from("tenants").update(...)). On Vercel the client session is sometimes
// unavailable even for a valid user, so those writes hung with no error handling — the
// "Guardar" button stayed stuck on "Guardando..." forever. Doing it here with the
// service-role admin client (same pattern as every other reliable write in the app)
// makes it deterministic, and the tenant is authorized server-side so a receptionist
// can't edit another business.
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json().catch(() => ({}));
  const { business, hours } = body;

  const { tenantId } = await resolveTenantForRequest(body.tenantId);
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });
  }

  if (business) {
    const { error } = await supabase
      .from("tenants")
      .update({
        name: business.name,
        address: business.address,
        phone: business.phone,
        website: business.website ?? null,
        // Item 37 (Nico, 27-sep): el wizard de onboarding tambien pide redes sociales en
        // el mismo paso que los datos del negocio; solo se toca si vino en el body, para
        // no pisar el valor existente cuando Configuracion llama a este endpoint sin el
        // campo (formulario que no lo incluye).
        ...(business.social_media !== undefined ? { social_media: business.social_media } : {}),
        // Rubro (Nico, 28-sep, migracion 078): solo si vino en el body y es un valor valido,
        // para que Configuracion (que no lo manda) no lo pise.
        ...(BUSINESS_CATEGORY_VALUES.includes(business.business_category) ? { business_category: business.business_category } : {}),
      })
      .eq("id", tenantId);
    if (error) {
      return NextResponse.json({ error: `No se pudieron guardar los datos: ${error.message}` }, { status: 500 });
    }
  }

  if (Array.isArray(hours)) {
    for (const day of hours) {
      const { error } = await supabase
        .from("business_hours")
        .upsert(
          {
            tenant_id: tenantId,
            day_of_week: day.day_of_week,
            open_time: day.open_time,
            close_time: day.close_time,
            is_closed: day.is_closed,
          },
          { onConflict: "tenant_id,day_of_week" }
        );
      if (error) {
        return NextResponse.json({ error: `No se pudieron guardar los horarios: ${error.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
