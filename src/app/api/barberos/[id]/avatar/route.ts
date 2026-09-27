import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, authorizeBarberManagement } from "@/lib/supabase/server";

// POST: Upload avatar for a professional
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorizeBarberManagement(params.id, { allowSelf: true });
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `avatars/${params.id}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Upload (upsert to overwrite previous avatar)
  const { error: uploadError } = await supabase.storage
    .from("cut-photos")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("cut-photos")
    .getPublicUrl(fileName);

  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`; // cache bust

  // Update profile
  await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", params.id);

  return NextResponse.json({ url: avatarUrl });
}

// DELETE: Remove avatar
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorizeBarberManagement(params.id, { allowSelf: true });
  if (!auth.ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = createAdminSupabase();

  // Remove from storage
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", params.id)
    .single();

  if (profile?.avatar_url) {
    const path = profile.avatar_url.split("/cut-photos/")[1]?.split("?")[0];
    if (path) {
      await supabase.storage.from("cut-photos").remove([path]);
    }
  }

  await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", params.id);

  return NextResponse.json({ success: true });
}
