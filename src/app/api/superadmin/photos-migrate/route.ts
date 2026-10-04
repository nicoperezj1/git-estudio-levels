import { NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Mueve las fotos antiguas de clientes (bucket PUBLICO "cut-photos") al bucket PRIVADO "client-photos" (solo super admin).
// GET  -> cuántas fotos siguen en el bucket público.
// POST -> mueve hasta 100 por vuelta (copia, actualiza la fila y recién entonces borra la original). Repetir hasta que
//         "pendientes" llegue a 0. Es seguro correrlo varias veces; si una foto falla, queda como estaba.
async function guard() {
  const { userId, role } = await getCurrentUserRoleAndTenant();
  return !!userId && role === "super_admin";
}
const PRIVATE_PREFIX = "private:client-photos/";

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { count } = await supabase.from("client_photos").select("id", { count: "exact", head: true }).like("url", "%/cut-photos/%");
  return NextResponse.json({ pendientes: count || 0 });
}

export async function POST() {
  if (!(await guard())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();
  const { data: bucket, error: bErr } = await supabase.storage.getBucket("client-photos");
  if (bErr || !bucket) return NextResponse.json({ error: "Falta aplicar la migración 101 (bucket client-photos)." }, { status: 409 });

  const { data: rows } = await supabase.from("client_photos").select("id, url").like("url", "%/cut-photos/%").limit(100);
  let moved = 0, failed = 0;
  for (const r of rows || []) {
    const path = String(r.url).split("/cut-photos/")[1]?.split("?")[0];
    if (!path) { failed++; continue; }
    const { data: file, error: dErr } = await supabase.storage.from("cut-photos").download(path);
    if (dErr || !file) { failed++; continue; }
    const up = await supabase.storage.from("client-photos").upload(path, file, { contentType: file.type || undefined, upsert: true });
    if (up.error) { failed++; continue; }
    const { error: uErr } = await supabase.from("client_photos").update({ url: `${PRIVATE_PREFIX}${path}` }).eq("id", r.id);
    if (uErr) { failed++; continue; }
    await supabase.storage.from("cut-photos").remove([path]);
    moved++;
  }
  const { count } = await supabase.from("client_photos").select("id", { count: "exact", head: true }).like("url", "%/cut-photos/%");
  return NextResponse.json({ success: true, movidas: moved, fallidas: failed, pendientes: count || 0 });
}
