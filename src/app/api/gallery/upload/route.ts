import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// Upload image to Supabase Storage and return URL
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const barberId = formData.get("barberId") as string;

  if (!file || !barberId) {
    return NextResponse.json({ error: "Archivo y profesional requeridos" }, { status: 400 });
  }

  // Generate unique filename
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${barberId}/${Date.now()}.${ext}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from("gallery")
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error("Gallery upload error:", error);
    if (error.message.includes("not found") || error.message.includes("Bucket")) {
      return NextResponse.json({ error: "El bucket de galeria no existe. Crea un bucket 'gallery' en Supabase Storage." }, { status: 500 });
    }
    return NextResponse.json({ error: `Error subiendo: ${error.message}` }, { status: 500 });
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from("gallery")
    .getPublicUrl(data.path);

  return NextResponse.json({ url: publicUrl });
}
