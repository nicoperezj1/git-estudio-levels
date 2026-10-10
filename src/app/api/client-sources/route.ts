import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";
import { BUILTIN_SOURCES, SOURCE_LABELS, loadCustomSources, slugifySource } from "@/lib/client-sources";

// Origenes de cliente propios del negocio ("¿Como nos conocio?" > + Crear otra opcion).
export async function GET(req: NextRequest) {
  const session = await getCurrentUserRoleAndTenant();
  if (!session.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  const supabase = createAdminSupabase();
  return NextResponse.json({ custom: await loadCustomSources(supabase, tenantId) });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUserRoleAndTenant();
  if (!session.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { tenantId } = await resolveTenantForRequest(body.tenantId || null);
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "No se pudo determinar el negocio" }, { status: 400 });

  const label = String(body.label || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (label.length < 2) return NextResponse.json({ error: "Escribe un nombre de al menos 2 letras" }, { status: 400 });

  const supabase = createAdminSupabase();
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  // Si ya existe (de las de siempre o una propia con el mismo nombre) se usa esa, sin duplicar.
  const builtin = [...BUILTIN_SOURCES, { code: "link", label: SOURCE_LABELS.link }].find((s) => norm(s.label) === norm(label));
  if (builtin) return NextResponse.json({ code: builtin.code, label: builtin.label, existed: true });
  const mine = await loadCustomSources(supabase, tenantId);
  const dup = mine.find((s) => norm(s.label) === norm(label));
  if (dup) return NextResponse.json({ ...dup, existed: true });

  const code = slugifySource(label);
  const sameCode = mine.find((s) => s.code === code);
  if (sameCode) return NextResponse.json({ ...sameCode, existed: true });
  const { error } = await supabase.from("client_sources").upsert(
    { tenant_id: tenantId, code, label, active: true, created_by: session.userId },
    { onConflict: "tenant_id,code" },
  );
  if (error) {
    const missing = /relation .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 104 en la base de datos." : error.message }, { status: 500 });
  }
  return NextResponse.json({ code, label });
}
