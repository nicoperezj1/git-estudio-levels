import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";
import { hashPin, pinHashReady } from "@/lib/pin";

// Calcula la huella de los PIN que todavía no la tienen (solo super admin). Se puede correr cuantas veces se quiera.
// GET  -> cuántos PIN tienen huella y cuántos faltan (no cambia nada).
// POST -> completa las huellas que faltan. NO borra el PIN en claro: eso es un paso aparte y manual
//         (ver docs/legal/REVISION-TECNICA.md).
async function guard() {
  const { userId, role } = await getCurrentUserRoleAndTenant();
  return !!userId && role === "super_admin";
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  if (!(await pinHashReady(supabase))) return NextResponse.json({ error: "Falta aplicar la migración 101 en la base de datos." }, { status: 409 });
  const { count: withPin } = await supabase.from("profiles").select("id", { count: "exact", head: true }).not("personal_pin", "is", null);
  const { count: missing } = await supabase.from("profiles").select("id", { count: "exact", head: true }).not("personal_pin", "is", null).is("personal_pin_hash", null);
  const { count: plain } = await supabase.from("profiles").select("id", { count: "exact", head: true }).not("personal_pin", "is", null).not("personal_pin_hash", "is", null);
  return NextResponse.json({ conPin: withPin || 0, sinHuella: missing || 0, conHuellaYValor: plain || 0 });
}

export async function POST() {
  if (!(await guard())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  if (!(await pinHashReady(supabase))) return NextResponse.json({ error: "Falta aplicar la migración 101 en la base de datos." }, { status: 409 });
  const { data } = await supabase.from("profiles").select("id, personal_pin").not("personal_pin", "is", null).is("personal_pin_hash", null).limit(5000);
  let updated = 0, skipped = 0;
  for (const p of data || []) {
    const h = hashPin(String(p.personal_pin));
    if (!h) { skipped++; continue; } // PIN que no son 4 dígitos: no se tocan
    const { error } = await supabase.from("profiles").update({ personal_pin_hash: h }).eq("id", p.id);
    if (error) skipped++; else updated++;
  }
  return NextResponse.json({ success: true, actualizados: updated, omitidos: skipped });
}
