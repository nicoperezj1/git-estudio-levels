-- 100: Centro de notificaciones (bandeja + avisos del admin al equipo + preferencias).
-- Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes.
-- Todo queda APAGADO por defecto: cada negocio lo enciende en Configuracion > Avisos y notificaciones.

-- Interruptor por negocio.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notification_center_enabled BOOLEAN NOT NULL DEFAULT false;

-- Una fila por persona que recibe un aviso (asi cada quien lo marca leido por su cuenta).
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,                 -- quien lo recibe
  kind          TEXT NOT NULL,                 -- appointment_new, planilla_created, announcement, ...
  title         TEXT NOT NULL,
  body          TEXT,
  url           TEXT,                          -- a donde lleva al tocarlo (ruta interna)
  requires_ack  BOOLEAN NOT NULL DEFAULT false, -- pide confirmacion de lectura ("Entendido")
  group_id      UUID,                          -- los avisos del admin comparten grupo
  created_by    UUID,
  created_by_name TEXT,
  read_at       TIMESTAMPTZ,
  ack_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(tenant_id, group_id);

-- Preferencias de cada persona.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       UUID PRIMARY KEY,
  tenant_id     UUID,
  muted_kinds   TEXT[] NOT NULL DEFAULT '{}',   -- tipos que NO quiere recibir (los esenciales no se pueden silenciar)
  quiet_start   TEXT,                           -- 'HH:MM' hora de Chile; sin sonar entre quiet_start y quiet_end
  quiet_end     TEXT,
  hide_details  BOOLEAN NOT NULL DEFAULT false, -- true: el aviso en pantalla bloqueada no lleva nombres ni montos
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo se leen y escriben desde el servidor (igual que audit_log): RLS activo sin politicas.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Verificacion: debe devolver 3 filas.
SELECT 'tenants.notification_center_enabled' AS item FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'notification_center_enabled'
UNION ALL SELECT 'tabla notifications' FROM information_schema.tables WHERE table_name = 'notifications'
UNION ALL SELECT 'tabla notification_preferences' FROM information_schema.tables WHERE table_name = 'notification_preferences';
