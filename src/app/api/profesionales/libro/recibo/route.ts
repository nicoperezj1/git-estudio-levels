import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { computeProMonths, isLedgerEnabled, type ProMode } from "@/lib/ledger";
import { buildReceiptPdf } from "@/lib/receipt-pdf";

export const dynamic = "force-dynamic";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Recibo en PDF de un profesional para un mes. Lo puede bajar el administrador, recepcion, o el propio profesional
// (solo el suyo). Solo existe con el libro de movimientos encendido.
export async function GET(req: NextRequest) {
  const caller = await getCurrentUserRoleAndTenant();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId") || "";
  const isManager = caller.role === "admin" || caller.role === "receptionist" || caller.role === "super_admin";
  if (!caller.userId || !barberId || (!isManager && caller.userId !== barberId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const { tenantId, denied } = await resolveTenantForRequest(searchParams.get("tenantId"));
  if (denied || !tenantId || tenantId === "ALL") return NextResponse.json({ error: "Negocio no valido" }, { status: 400 });
  if (!(await isLedgerEnabled(supabase, tenantId))) {
    return NextResponse.json({ error: "El libro de movimientos no esta activado para este negocio." }, { status: 409 });
  }

  const month = Math.min(12, Math.max(1, parseInt(searchParams.get("month") || "") || 0));
  const year = parseInt(searchParams.get("year") || "") || 0;
  if (!month || !year) return NextResponse.json({ error: "Mes no valido" }, { status: 400 });

  // El profesional puede estar en una u otra modalidad: se busca primero en la pedida.
  const first: ProMode = searchParams.get("mode") === "rental" ? "rental" : "commission";
  let pro = (await computeProMonths(supabase, { tenantId, mode: first, year, month })).find((p) => p.barberId === barberId);
  if (!pro) pro = (await computeProMonths(supabase, { tenantId, mode: first === "rental" ? "commission" : "rental", year, month })).find((p) => p.barberId === barberId);
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const { data: tenant } = await supabase.from("tenants").select("name, logo_url").eq("id", tenantId).maybeSingle();
  let logo: Uint8Array | null = null;
  const url = tenant?.logo_url;
  if (typeof url === "string" && url.startsWith("https://")) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (r.ok) logo = new Uint8Array(await r.arrayBuffer());
    } catch { logo = null; }
  }

  const bytes = await buildReceiptPdf({
    businessName: tenant?.name || "re-booking", logo, pro, monthLabel: `${MONTHS[month - 1]} ${year}`,
  });
  const slug = pro.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${slug}-${year}-${String(month).padStart(2, "0")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
