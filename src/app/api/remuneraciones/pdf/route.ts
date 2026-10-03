import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { monthLabelEs, monthStart } from "@/lib/accounting";
import { buildPayslipPdf } from "@/lib/payslip-pdf";

export const dynamic = "force-dynamic";

const CONTRACTS: Record<string, string> = { indefinido: "Indefinido", plazo_fijo: "Plazo fijo", obra: "Por obra o faena" };

// PDF de la liquidacion GUARDADA (borrador, emitida o pagada). Solo administrador.
export async function GET(req: NextRequest) {
  const c = await getCurrentUserRoleAndTenant();
  if ((c.role !== "admin" && c.role !== "super_admin") || !c.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const first = monthStart(sp.get("month"));
  const barberId = sp.get("barberId");
  if (!first || !barberId) return NextResponse.json({ error: "Datos no validos" }, { status: 400 });
  const supabase = createAdminSupabase();
  const [{ data: slip }, { data: pro }, { data: file }, { data: tenant }] = await Promise.all([
    supabase.from("payslips").select("*").eq("tenant_id", c.tenantId).eq("barber_id", barberId).eq("month", first).maybeSingle(),
    supabase.from("profiles").select("name").eq("id", barberId).eq("tenant_id", c.tenantId).maybeSingle(),
    supabase.from("employee_files").select("*").eq("tenant_id", c.tenantId).eq("barber_id", barberId).maybeSingle(),
    supabase.from("tenants").select("name, logo_url, rut_empresa, address").eq("id", c.tenantId).maybeSingle(),
  ]);
  if (!slip || !pro) return NextResponse.json({ error: "Guarda la liquidación antes de bajar el PDF." }, { status: 404 });

  let logo: Uint8Array | null = null;
  const url = (tenant as any)?.logo_url;
  if (typeof url === "string" && url.startsWith("https://")) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(4000) }); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()); } catch { logo = null; }
  }
  const bytes = await buildPayslipPdf({
    businessName: (tenant as any)?.name || "re-booking", logo, workerName: (pro as any).name, monthLabel: monthLabelEs(first),
    result: slip.result, contractLabel: CONTRACTS[(file as any)?.contract_type] || "Indefinido", status: slip.status,
    issuedAt: slip.issued_at ? new Date(slip.issued_at) : undefined,
    employer: { rut: (tenant as any)?.rut_empresa, address: (tenant as any)?.address },
    worker: {
      rut: (file as any)?.rut, position: (file as any)?.position, costCenter: (file as any)?.cost_center, hireDate: (file as any)?.hire_date,
      afp: (file as any)?.afp_name ? `${(file as any).afp_name} (${(file as any).afp_rate}%)` : null,
      health: (file as any)?.health_system === "isapre" ? `Isapre (plan ${(file as any).isapre_plan_uf} UF)` : "Fonasa",
    },
    payment: slip.inputs?.payment,
  });
  const slug = String((pro as any).name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="liquidacion-${slug}-${first.slice(0, 7)}.pdf"`, "Cache-Control": "no-store" },
  });
}
