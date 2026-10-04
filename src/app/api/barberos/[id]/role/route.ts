import { NextRequest, NextResponse } from "next/server";
import { pinOr } from "@/lib/pin";
import { createAdminSupabase, authorizeBarberManagement } from "@/lib/supabase/server";

// PATCH: Change a user's role (requires admin PIN)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const { role, pin } = await req.json();

  // SEGURIDAD: antes bastaba adivinar el PIN de 4 digitos de CUALQUIER admin (sin login)
  // para cambiar el rol de cualquiera, incluso a super_admin. Ahora exige sesion de admin
  // del mismo negocio (o super_admin), y solo super_admin puede otorgar super_admin.
  const auth = await authorizeBarberManagement(params.id);
  if (!auth.ok || (auth.role !== "admin" && auth.role !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (role === "super_admin" && auth.role !== "super_admin") {
    return NextResponse.json({ error: "Solo un super admin puede asignar ese rol" }, { status: 403 });
  }

  // Validate PIN
  if (!pin || pin.length !== 4) {
    return NextResponse.json({ error: "PIN de 4 digitos requerido" }, { status: 400 });
  }

  // Verify admin PIN
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, name")
    .in("role", ["admin", "super_admin"])
    .or(await pinOr(supabase, pin))
    .eq("id", auth.userId)
    .eq("active", true)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  // Validate role
  const validRoles = ["barber", "admin", "super_admin", "receptionist"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  // Update role
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: `Rol actualizado por ${admin.name}` });
}
