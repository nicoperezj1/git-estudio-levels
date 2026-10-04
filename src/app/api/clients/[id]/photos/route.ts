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

// Fotos nuevas: bucket PRIVADO "client-photos" (migracion 101), guardadas como "private:client-photos/<ruta>" y servidas
// con link firmado temporal. Las antiguas (bucket publico "cut-photos") siguen funcionando hasta que se muevan con
// /api/superadmin/photos-migrate. Si el bucket privado aun no existe, se sube al publico como antes.
const PRIVATE_BUCKET = "client-photos";
const PRIVATE_PREFIX = `private:${PRIVATE_BUCKET}/`;
const SIGNED_SECONDS = 60 * 60;

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

  const out = await Promise.all((photos || []).map(async (p: any) => {
    if (typeof p.url === "string" && p.url.startsWith(PRIVATE_PREFIX)) {
      const { data: signed } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(p.url.slice(PRIVATE_PREFIX.length), SIGNED_SECONDS);
      return { ...p, url: signed?.signedUrl || null };
    }
    return p;
  }));
  return NextResponse.json(out);
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

  let url: string;
  let up = await supabase.storage.from(PRIVATE_BUCKET).upload(fileName, buffer, { contentType: file.type, upsert: false });
  if (!up.error) {
    url = `${PRIVATE_PREFIX}${fileName}`;
  } else {
    // Sin la migracion 101 (bucket privado inexistente): se sube al publico como antes.
    const pub = await supabase.storage.from("cut-photos").upload(fileName, buffer, { contentType: file.type, upsert: false });
    if (pub.error) return NextResponse.json({ error: pub.error.message }, { status: 500 });
    url = supabase.storage.from("cut-photos").getPublicUrl(fileName).data.publicUrl;
  }

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

  if (photo && url.startsWith(PRIVATE_PREFIX)) {
    const { data: signed } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(url.slice(PRIVATE_PREFIX.length), SIGNED_SECONDS);
    return NextResponse.json({ ...photo, url: signed?.signedUrl || null });
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
    if (photo.url.startsWith(PRIVATE_PREFIX)) {
      await supabase.storage.from(PRIVATE_BUCKET).remove([photo.url.slice(PRIVATE_PREFIX.length)]);
    } else {
      const path = photo.url.split("/cut-photos/")[1];
      if (path) await supabase.storage.from("cut-photos").remove([path]);
    }
  }

  await supabase.from("client_photos").delete().eq("id", photoId).eq("client_id", params.id);

  return NextResponse.json({ success: true });
}
