import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, resolveTenantForRequest } from "@/lib/supabase/server";
import { sendRetentionEmail } from "@/lib/resend";
import { todayInChile, toChileDateStr } from "@/lib/utils";

// POST: Send retention message to inactive clients OF THIS BUSINESS.
//
// Two safety guards after the incident where a business with 9 clients emailed 647
// people from OTHER businesses with no confirmation:
//   1. Tenant scoping is MANDATORY. Without a concrete tenant (or for a super_admin's
//      "ALL"), we refuse — a bulk send must never run across every business.
//   2. `preview: true` returns the recipient list WITHOUT sending, so the UI can show a
//      confirmation with a sample before anything goes out.
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { days, couponCode, message, type, preview } = body; // type: 'email' | 'whatsapp'

  // Resolve and REQUIRE a single tenant. This is the fix for the cross-business leak:
  // the query below used to hit every client of every business (service-role bypasses
  // RLS). "ALL" (super_admin) is rejected too — a mass send must target one business.
  // SEGURIDAD: nunca confiar directo en el tenantId de la URL — resolveTenantForRequest lo
  // reemplaza por el negocio real del usuario logueado salvo que sea super_admin.
  const { searchParams } = new URL(req.url);
  const { tenantId } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") {
    return NextResponse.json(
      { error: "No se pudo identificar el negocio. Recarga la pagina e intenta de nuevo." },
      { status: 400 }
    );
  }

  // Bug (reportado por Nico, 27-sep): mismo problema encontrado en GET /api/retention —
  // esto comparaba una fecha calendario pura (appointments.date) contra un instante UTC
  // (new Date()/setDate()), corriendo el corte unas horas por el desfase de Chile con UTC.
  // Ademas, a diferencia de esa pantalla, este envio masivo NUNCA aplicaba
  // tenants.retention_start_date (Punto 13, Pablo) — asi que un cliente cuya unica señal
  // era una visita/alta anterior al inicio real del negocio en re-booking (importacion,
  // pruebas) SI podia recibir el mensaje masivo, aunque la pantalla de Retencion ya lo
  // excluye a propósito por ser "dato no confiable". Se alinea con la misma logica.
  const cutoffDateStr = (() => {
    const [y, m, d] = todayInChile().split("-").map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12));
    anchor.setUTCDate(anchor.getUTCDate() - (days || 30));
    return anchor.toISOString().split("T")[0];
  })();

  let retentionStartDate: string | null = null;
  {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("retention_start_date, created_at")
      .eq("id", tenantId)
      .single();
    retentionStartDate = tenantRow?.retention_start_date || tenantRow?.created_at || null;
  }

  // Clients of THIS business only.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, phone, created_at")
    .eq("tenant_id", tenantId);

  // Last completed visit per client (scoped to this business's clients and, same as la
  // pantalla de Retencion, nunca antes del inicio real del negocio en re-booking).
  const clientIds = (clients || []).map((c) => c.id);
  const lastVisitMap: Record<string, string> = {};
  if (clientIds.length > 0) {
    let apptQuery = supabase
      .from("appointments")
      .select("client_id, date")
      .eq("status", "completed")
      .in("client_id", clientIds)
      .order("date", { ascending: false });
    if (retentionStartDate) apptQuery = apptQuery.gte("date", retentionStartDate);
    const { data: appointments } = await apptQuery;
    for (const appt of appointments || []) {
      if (!lastVisitMap[appt.client_id]) lastVisitMap[appt.client_id] = appt.date;
    }
  }

  // Filter inactive
  const inactiveClients = (clients || []).filter((c) => {
    let sinceRefDateStr = lastVisitMap[c.id] || toChileDateStr(c.created_at);
    if (!lastVisitMap[c.id] && retentionStartDate) {
      const retentionStartDateStr = toChileDateStr(retentionStartDate);
      if (sinceRefDateStr < retentionStartDateStr) sinceRefDateStr = retentionStartDateStr;
    }
    return sinceRefDateStr < cutoffDateStr;
  });

  if (type === "email") {
    const withEmail = inactiveClients.filter((c) => c.email);

    // Preview mode: return who WOULD receive it + a small sample, send nothing.
    if (preview) {
      return NextResponse.json({
        preview: true,
        total: withEmail.length,
        sample: withEmail.slice(0, 5).map((c) => ({ name: c.name, email: c.email })),
      });
    }

    let sent = 0;
    for (const client of withEmail) {
      try {
        await sendRetentionEmail({
          to: client.email!,
          clientName: client.name,
          message: message || "Te extrañamos! Vuelve pronto.",
          couponCode: couponCode || null,
          couponDescription: null,
          discountType: null,
          discountValue: null,
        });
        sent++;
      } catch (e) {
        console.error(`Error sending to ${client.email}:`, e);
      }
    }

    return NextResponse.json({ success: true, sent, total: withEmail.length });
  }

  if (type === "whatsapp") {
    const bookingUrl = process.env.NEXT_PUBLIC_APP_URL || "https://re-booking.cl";
    const withPhone = inactiveClients.filter((c) => c.phone);

    const links = withPhone.map((c) => {
      const phone = c.phone!.replace(/\D/g, "").replace(/^0/, "56");
      const whatsappPhone = phone.startsWith("56") ? phone : `56${phone}`;
      let msg = message || `Hola ${c.name}! Te extrañamos.`;
      if (couponCode) msg += `\n\nUsa tu cupon: ${couponCode}`;
      msg += `\n\nAgenda: ${bookingUrl}/booking`;

      return {
        name: c.name,
        phone: c.phone,
        url: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(msg)}`,
      };
    });

    return NextResponse.json({ success: true, links, total: links.length });
  }

  return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
}
