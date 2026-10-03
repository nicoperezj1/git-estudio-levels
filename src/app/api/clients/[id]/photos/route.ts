import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// SEGURIDAD: antes ninguna de estas rutas pedia sesion: se podian ver, subir y borrar fotos de clientes de cualquier
// negocio. Ahora el cliente debe ser del negocio del usuario logueado (el super_admin puede con cualquiera).
async function authorizeClient(supabase: ReturnType<typeof createAdminSupabase>, clientId: string) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return { ok: false as const, status: 401 };
  if (role === "super_admin") return { ok: true as const, status: 200 };
  const { data: client } = await supabase.from("clients").select("tenant_id").eq("id", clientId).single();
  if (!client || client.tenant_id !== tenantId) return { ok: false as const, status: 403 };
  return { ok: true as const, status: 200 };
}

// GET: List photos for a client
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json([], { status: auth.status });

  const { data: photos } = await supabase
    .from("client_photos")
    .select("id, url, caption, created_at, barber_id, barber:profiles(name)")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  return NextResponse.json(photos || []);
}

// POST: Upload photo for a client
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: auth.status });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const caption = formData.get("caption") as string || null;
  const barberId = formData.get("barberId") as string || null;
  const appointmentId = formData.get("appointmentId") as string || null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Upload to Supabase Storage
  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${params.id}/${Date.now()}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("cut-photos")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("cut-photos")
    .getPublicUrl(fileName);

  const url = urlData.publicUrl;

  // Save record
  const { data: photo, error } = await supabase
    .from("client_photos")
    .insert({
      client_id: params.id,
      barber_id: barberId,
      url,
      caption,
      appointment_id: appointmentId,
    })
    .select("id, url, caption, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(photo);
}

// DELETE: Remove a photo
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabase();
  const auth = await authorizeClient(supabase, params.id);
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const photoId = searchParams.get("photoId");

  if (!photoId) {
    return NextResponse.json({ error: "photoId required" }, { status: 400 });
  }

  // Get photo URL to delete from storage
  const { data: photo } = await supabase
    .from("client_photos")
    .select("url")
    .eq("id", photoId)
    .eq("client_id", params.id)
    .single();
  if (!photo) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });

  if (photo?.url) {
    const path = photo.url.split("/cut-photos/")[1];
    if (path) {
      await supabase.storage.from("cut-photos").remove([path]);
    }
  }

  await supabase.from("client_photos").delete().eq("id", photoId).eq("client_id", params.id);

  return NextResponse.json({ success: true });
}
