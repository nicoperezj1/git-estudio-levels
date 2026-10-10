-- 104: Origenes de cliente creados por cada negocio ("¿Como nos conocio?" > + Crear otra opcion).
-- Aditiva y re-ejecutable. Los origenes de siempre (Instagram, TikTok...) siguen en el codigo; esta tabla
-- guarda solo los nuevos. clients.acquisition_source guarda el codigo (ej. c_radio) y no tiene restriccion.
CREATE TABLE IF NOT EXISTS client_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE client_sources ENABLE ROW LEVEL SECURITY;      -- sin politicas: solo la API (llave de servicio)

-- Verificacion (debe devolver 1 fila):
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_sources';
