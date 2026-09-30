import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// GET: Gallery images (public or filtered by barber)
export async function GET(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const barberId = searchParams.get("barberId");

  let query = supabase
    .from("gallery")
    .select(`
      *,
      barber:profiles(name),
      service:services(name)
    `)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (barberId) {
    query = query.eq("barber_id", barberId);
  }

  const { data } = await query;
  return NextResponse.json(data || []);
}

// POST: Upload image (receives URL after client-side upload to Supabase Storage)
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { barberId, imageUrl, caption, serviceId } = body;

  if (!barberId || !imageUrl) {
    return NextResponse.json({ error: "Profesional e imagen requeridos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("gallery")
    .insert({
      barber_id: barberId,
      image_url: imageUrl,
      caption: caption || null,
      service_id: serviceId || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE: Remove image
export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  await supabase.from("gallery").update({ active: false }).eq("id", id);
  return NextResponse.json({ success: true });
}
