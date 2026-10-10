import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

// POST: quita la marca de "clave temporal" despues de que el administrador cambio su clave.
// Solo vale para quien tiene la sesion abierta (antes recibia el email en el cuerpo, asi que
// cualquiera podia apagar la marca de otro negocio).
export async function POST() {
  const { data: { user } } = await createServerSupabase().auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { error } = await createAdminSupabase()
    .from("tenants")
    .update({
      must_change_password: false,
      temp_password: null,
    })
    .ilike("admin_email", user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
