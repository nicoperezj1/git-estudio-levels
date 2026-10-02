import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeProfileAccess } from "@/lib/supabase/server";

// PATCH: Cambiar el rol de un usuario.
// SEGURIDAD: antes bastaba un PIN de 4 digitos (de un admin de CUALQUIER negocio) y no se
// pedia sesion: se podia ascender a cualquiera a super_admin. Ahora exige sesion de admin del
// mismo negocio del usuario (o super_admin) y, ademas, el PIN de ese administrador.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeProfileAccess(params.id);
  if (!access.ok) return access.response;
  if (access.level !== "admin" && access.level !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede cambiar roles" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const { role, pin } = await req.json();

  // Validate PIN
  if (!pin || String(pin).length !== 4) {
    return NextResponse.json({ error: "PIN de 4 digitos requerido" }, { status: 400 });
  }

  // El PIN debe ser el de un administrador activo DEL MISMO NEGOCIO que quien lo pide
  // (super_admin: de cualquier negocio). limit(1): nunca falla por PIN repetido.
  let pinQuery = supabase
    .from("profiles")
    .select("id, name")
    .in("role", ["admin", "super_admin"])
    .eq("personal_pin", String(pin))
    .eq("active", true);
  if (access.role !== "super_admin") pinQuery = pinQuery.eq("tenant_id", access.tenantId as string);
  const { data: admins } = await pinQuery.limit(1);
  const admin = admins && admins.length > 0 ? admins[0] : null;

  if (!admin) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  // Validate role. Solo un super_admin puede otorgar el rol super_admin.
  const validRoles = ["barber", "admin", "receptionist", "super_admin"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }
  if (role === "super_admin" && access.role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado para otorgar ese rol" }, { status: 403 });
  }

  // Update role
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: `Rol actualizado por ${admin.name}` });
}
