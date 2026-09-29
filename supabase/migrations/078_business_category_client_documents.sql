-- Pedido de Nico (28-sep): (1) segmentar que tipo de negocio (rubro) usa re-booking, para
-- saber cuantos hay de barberia, estetica, peluqueria, manicure, clinica, etc.; (2) permitir
-- subir documentos (PDF/Word) en la ficha de un cliente, habilitable por negocio (pensado
-- para clinicas, kinesiologia, centros de estetica; para barberia no hace falta).

-- 1) Rubro del negocio. NULL = "sin clasificar" a proposito: los negocios que ya existen
--    no se asumen barberias, se clasifican a mano desde Superadmin.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category TEXT;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_business_category_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_business_category_check
  CHECK (business_category IS NULL OR business_category IN
    ('barberia', 'peluqueria', 'estetica', 'manicure', 'spa', 'clinica', 'kinesiologia', 'otro'));

-- 2) Interruptor por negocio para la carga de documentos en la ficha de cliente.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_files_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3) Documentos de cliente. RLS activado SIN policies: solo se lee/escribe desde el
--    servidor con el cliente admin (mismo patron que audit_log / message_usage), porque
--    pueden contener datos sensibles (ej. fichas clinicas).
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id, created_at DESC);
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- 4) Bucket PRIVADO (a diferencia de las fotos de cortes): los documentos se sirven solo
--    con links firmados temporales, nunca con una URL publica adivinable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;
