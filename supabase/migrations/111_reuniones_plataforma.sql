-- 111: Calendario de reuniones de la plataforma (solo super admin). Aditiva y re-ejecutable. Hacer RESPALDO antes.
-- Fecha y hora se guardan como hora de Chile "escrita" (igual que las citas): meeting_date + start_time/end_time HH:MM.

CREATE TABLE IF NOT EXISTS platform_meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  meeting_date  DATE NOT NULL,
  start_time    TEXT NOT NULL,                 -- 'HH:MM'
  end_time      TEXT,                          -- 'HH:MM' (opcional)
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,  -- negocio con el que es la reunion (opcional)
  notes         TEXT,
  link          TEXT,                          -- videollamada
  reminded_at   TIMESTAMPTZ,                   -- cuando se mando el aviso de "empieza pronto"
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_meetings_date ON platform_meetings(meeting_date);

-- Solo el servidor la lee y escribe (rutas de super admin): RLS activo sin politicas.
ALTER TABLE platform_meetings ENABLE ROW LEVEL SECURITY;

-- Verificacion: debe devolver 1 fila.
SELECT 'tabla platform_meetings' AS item FROM information_schema.tables WHERE table_name = 'platform_meetings';
