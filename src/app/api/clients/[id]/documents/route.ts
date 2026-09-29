import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getCurrentUserRoleAndTenant } from "@/lib/supabase/server";

// Documentos (PDF/Word) en la ficha de un cliente (Nico, 28-sep). Pensado para negocios
// tipo clinica / kinesiologia / estetica; se habilita por negocio con
// tenants.client_files_enabled (Superadmin). Como pueden contener datos sensibles:
//   - el usuario debe estar logueado y ser del mismo negocio que el cliente (o super_admin)
//   - el bucket es privado y se sirve solo con links firmados temporales
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const SIGNED_URL_SECONDS = 60 * 60;

async function authorize(clientId: string) {
  const { userId, role, tenantId } = await getCurrentUserRoleAndTenant();
  if (!userId) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const supabase = createAdminSupabase();
  const { data: client } = await supabase.from("clients").select("id, tenant_id").eq("id", clientId).single();
  if (!client) return { error: NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 }) };

  if (role !== "super_admin" && client.tenant_id !== tenantId) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("client_files_enabled")
    .eq("id", client.tenant_id)
    .single();

  return {
    supabase,
    userId,
    role,
    tenantId: client.tenant_id as string,
    enabled: !!tenant?.client_files_enabled,
  };
}

// GET: lista los documentos del cliente con un link firmado temporal para cada uno.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, enabled } = auth as Exclude<typeof auth, { error: NextResponse }>;

  if (!enabled) return NextResponse.json({ enabled: false, documents: [] });

  const { data: docs } = await supabase
    .from("client_documents")
    .select("id, file_name, storage_path, mime_type, size_bytes, created_at, uploader:profiles(name)")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  const documents = await Promise.all(
    (docs || []).map(async (d: any) => {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, SIGNED_URL_SECONDS);
      return {
        id: d.id,
        file_name: d.file_name,
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
        created_at: d.created_at,
        uploaded_by_name: d.uploader?.name || null,
        url: signed?.signedUrl || null,
      };
    })
  );

  return NextResponse.json({ enabled: true, documents });
}

// POST: sube un documento (PDF / Word, hasta 10MB).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, enabled, tenantId, userId } = auth as Exclude<typeof auth, { error: NextResponse }>;

  if (!enabled) {
    return NextResponse.json({ error: "La carga de archivos no esta habilitada para este negocio." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT[ext]) {
    return NextResponse.json({ error: "Solo se permiten archivos PDF o Word (.pdf, .doc, .docx)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera el maximo de 10MB." }, { status: 400 });
  }

  // Nombre de almacenamiento seguro (sin caracteres raros); el nombre original se guarda
  // aparte en la base para mostrarlo tal cual.
  const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "documento";
  const storagePath = `${tenantId}/${params.id}/${Date.now()}-${safeBase}.${ext}`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: ALLOWED_EXT[ext], upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: doc, error } = await supabase
    .from("client_documents")
    .insert({
      tenant_id: tenantId,
      client_id: params.id,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: ALLOWED_EXT[ext],
      size_bytes: file.size,
      uploaded_by: userId,
    })
    .select("id, file_name, created_at")
    .single();

  if (error) {
    // Si el registro falla, no dejar el archivo huerfano en el storage.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(doc, { status: 201 });
}

// DELETE: elimina un documento (solo admin del negocio o super_admin).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, role } = auth as Exclude<typeof auth, { error: NextResponse }>;

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Solo un administrador puede eliminar documentos." }, { status: 403 });
  }

  const documentId = new URL(req.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "documentId requerido" }, { status: 400 });

  // .eq("client_id") evita borrar un documento de otro cliente/negocio pasando su id.
  const { data: doc } = await supabase
    .from("client_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("client_id", params.id)
    .single();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  await supabase.from("client_documents").delete().eq("id", documentId);

  return NextResponse.json({ success: true });
}
