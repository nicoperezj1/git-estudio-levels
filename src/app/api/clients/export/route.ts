import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { todayInChile } from "@/lib/utils";
import { fetchAllRows } from "@/lib/accounting";

export async function GET() {
  const admin = createAdminSupabase();

  // Exporting the full client list is sensitive: only admin/super_admin, scoped to the
  // caller's own tenant (no cross-tenant leak). Never barbers or receptionists.
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  if (!role || !["admin", "super_admin"].includes(role)) {
    return new NextResponse("No tienes permisos para exportar clientes", { status: 403 });
  }

  // Todas las filas (Supabase corta en 1.000 por consulta) y, si falta la columna rut, se reintenta sin ella.
  const load = (cols: string) =>
    fetchAllRows<any>(() => {
      let q = admin.from("clients").select(cols);
      // Non super_admin is scoped to their own tenant.
      if (role !== "super_admin") q = q.eq("tenant_id", tenantId as string);
      return q;
    });
  if (role !== "super_admin" && !tenantId) {
    return new NextResponse("Sin negocio asignado", { status: 403 });
  }

  let clients: any[] = [];
  let withRut = true;
  try {
    clients = await load("id, name, email, phone, rut, notes, loyalty_points, created_at");
  } catch {
    withRut = false;
    try {
      clients = await load("id, name, email, phone, notes, loyalty_points, created_at");
    } catch (e: any) {
      return new NextResponse("No se pudo leer la lista de clientes", { status: 500 });
    }
  }
  clients.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));

  if (clients.length === 0) {
    return new NextResponse("Sin clientes", { status: 404 });
  }

  // Cada celda entre comillas (con "" adentro) y sin que Excel la tome como formula (=, +, -, @).
  const cell = (v: unknown) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };

  const headers = ["Nombre", "Email", "Telefono", ...(withRut ? ["RUT"] : []), "Notas", "Puntos Fidelidad", "Fecha Registro"].join(",");
  const rows = clients.map((c) =>
    [
      cell(c.name),
      cell(c.email),
      cell(c.phone),
      ...(withRut ? [cell(c.rut)] : []),
      cell(c.notes),
      Number(c.loyalty_points) || 0,
      cell(new Date(c.created_at).toLocaleDateString("es-CL")),
    ].join(",")
  );

  // BOM al inicio: Excel lo necesita para leer bien tildes y enes.
  const csv = "\uFEFF" + [headers, ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-rebooking-${todayInChile()}.csv"`,
    },
  });
}
