import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();

  // Bulk import is sensitive: only admin/super_admin. Imported clients are assigned to the
  // caller's tenant, and duplicate detection is scoped to that tenant.
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!role || !["admin", "super_admin"].includes(role)) {
    return NextResponse.json({ error: "No tienes permisos para importar clientes" }, { status: 403 });
  }

  const body = await req.json();
  const { clients, tenantId: bodyTenantId } = body; // array of { name, email, phone, notes }

  // super_admin may target a tenant explicitly; everyone else uses their own.
  const targetTenantId = role === "super_admin" ? (bodyTenantId || tenantId) : tenantId;
  if (!targetTenantId) {
    return NextResponse.json({ error: "No se pudo determinar el negocio destino" }, { status: 400 });
  }

  if (!clients || !Array.isArray(clients) || clients.length === 0) {
    return NextResponse.json({ error: "No hay clientes para importar" }, { status: 400 });
  }

  // Limpiar, descartar filas sin nombre y repetidos dentro del mismo archivo.
  const seenEmails = new Set<string>();
  let skipped = 0;
  const rows: Array<{ name: string; email: string | null; phone: string | null; rut: string | null; notes: string | null; tenant_id: string }> = [];
  for (const c of clients) {
    const name = typeof c?.name === "string" ? c.name.trim() : "";
    if (!name) { skipped++; continue; }
    const email = typeof c.email === "string" && c.email.trim() ? c.email.trim().toLowerCase() : null;
    if (email) {
      if (seenEmails.has(email)) { skipped++; continue; }
      seenEmails.add(email);
    }
    rows.push({
      name,
      email,
      phone: c.phone != null && String(c.phone).trim() ? String(c.phone).trim() : null,
      rut: typeof c.rut === "string" && c.rut.trim() ? c.rut.trim() : null,
      notes: typeof c.notes === "string" && c.notes.trim() ? c.notes.trim() : null,
      tenant_id: targetTenantId,
    });
  }

  // Repetidos contra la base (mismo negocio): una sola consulta por lote en vez de una por cliente.
  let toInsert = rows;
  if (seenEmails.size > 0) {
    const { data: existing, error: exErr } = await supabase
      .from("clients")
      .select("email")
      .eq("tenant_id", targetTenantId)
      .in("email", Array.from(seenEmails));
    if (exErr) {
      console.error("[clients/import] consulta de repetidos fallo:", exErr.message);
      return NextResponse.json({ error: `No se pudo revisar clientes repetidos: ${exErr.message}` }, { status: 500 });
    }
    const have = new Set((existing || []).map((r: any) => String(r.email || "").toLowerCase()));
    toInsert = rows.filter((r) => !(r.email && have.has(r.email)));
    skipped += rows.length - toInsert.length;
  }

  let imported = 0;
  let failed = 0;
  let lastError = "";
  if (toInsert.length > 0) {
    let bulkErr = (await supabase.from("clients").insert(toInsert)).error;
    // Tolera que falte la columna rut (migracion 035): reintenta sin ella.
    if (bulkErr && /\brut\b/i.test(bulkErr.message || "")) {
      console.error("[clients/import] falta la columna rut; importando sin RUT");
      toInsert = toInsert.map(({ rut, ...rest }) => ({ ...rest, rut: undefined as any }));
      bulkErr = (await supabase.from("clients").insert(toInsert)).error;
    }
    if (!bulkErr) {
      imported = toInsert.length;
    } else {
      // Si el lote falla por una fila mala, reintentar de a una para no perder las buenas.
      console.error("[clients/import] insercion en lote fallo:", bulkErr.message);
      for (const r of toInsert) {
        const { error } = await supabase.from("clients").insert(r);
        if (error) { failed++; lastError = error.message; } else imported++;
      }
    }
  }

  return NextResponse.json({ success: failed === 0, imported, skipped, failed, lastError: lastError || null, total: clients.length });
}
