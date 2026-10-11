-- 107: Casos de soporte ("Necesitas ayuda"). Aditiva y re-ejecutable.
-- Cada envio crea un caso con numero correlativo (RB-00001...). Las capturas solo viajan por correo.
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number BIGINT GENERATED ALWAYS AS IDENTITY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID,
  user_name TEXT,
  area TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  phone TEXT,
  page_url TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id, created_at DESC);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

-- Verificacion (debe devolver 1 fila):
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets';
