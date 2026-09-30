import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant, resolveTenantForRequest } from "@/lib/supabase/server";

// Imagen del negocio (banner de la página de reservas), guardada en tenants.banner_url.
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });

  let formData: FormData;
  try { formData = await req.formData(); } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer el archivo enviado: ${e.message}` }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const { tenantId: resolved } = await resolveTenantForRequest(formData.get("tenantId") as string | null);
  const tenantId = resolved && resolved !== "ALL" ? resolved : "";

  if (!file) return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  if (!tenantId) return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)}MB, el máximo es 8MB.` }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const fileName = `banners/${tenantId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("cut-photos")
    .upload(fileName, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: `No se pudo subir la imagen: ${uploadError.message}` }, { status: 500 });

  const { data: urlData } = supabase.storage.from("cut-photos").getPublicUrl(fileName);
  const url = `${urlData.publicUrl}?t=${Date.now()}`;
  const { error } = await supabase.from("tenants").update({ banner_url: url }).eq("id", tenantId);
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "Falta aplicar la migración 082 en la base de datos." : error.message }, { status: 500 });
  }
  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { role } = await getCurrentUserRoleAndTenant();
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Solo el administrador puede cambiar esto" }, { status: 403 });

  const { tenantId } = await resolveTenantForRequest(new URL(req.url).searchParams.get("tenantId"));
  if (!tenantId || tenantId === "ALL") return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });

  const { data: t } = await supabase.from("tenants").select("banner_url").eq("id", tenantId).single();
  const path = (t as any)?.banner_url?.split("/cut-photos/")[1]?.split("?")[0];
  if (path) await supabase.storage.from("cut-photos").remove([path]);
  await supabase.from("tenants").update({ banner_url: null }).eq("id", tenantId);
  return NextResponse.json({ success: true });
}
