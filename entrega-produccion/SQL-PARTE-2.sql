-- SQL PARTE 2 PARA PRODUCCION (re-booking). NO correr hasta que Nico termine de probar en `rebooking-pruebas`.
-- Va DESPUES de SQL-PRODUCCION.sql (migraciones 086-099). Contiene las migraciones 100 y 101.
-- Aditivas y re-ejecutables. Hacer respaldo antes.

-- ================= 100_notificaciones.sql =================
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


-- ================= 101_pin_huella_y_consentimiento.sql =================
-- 101: (a) "huella" del PIN personal y (b) consentimiento de promociones de los clientes.
-- Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes.

-- (a) PIN: se agrega una columna con la huella (HMAC) del PIN. El valor actual NO se toca;
-- una etapa posterior (documentada en docs/legal/REVISION-TECNICA.md) lo borra cuando todos tengan huella.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_pin_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_pin_hash ON profiles(tenant_id, personal_pin_hash);

-- (b) Consentimiento para promociones y mensajes de retencion (Ley 21.719).
--   marketing_consent: la persona acepto recibir promociones (NULL = nunca se le pregunto).
--   do_not_contact: pidio no ser contactada; se respeta en retencion y mensajes masivos.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false;

-- Verificacion: debe devolver 4 filas.

-- (c) Fotos de clientes en un bucket PRIVADO. El bucket 'cut-photos' es publico a proposito (logos, avatares y fotos de
-- servicios se ven en la reserva online), asi que las fotos de clientes se mueven a uno aparte, servido con links temporales.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Verificacion del bucket: debe devolver 1 fila con public = false.


-- ================= VERIFICACION (debe devolver 8 filas) =================
SELECT 'tenants.notification_center_enabled' AS item FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'notification_center_enabled'
UNION ALL SELECT 'tabla notifications' FROM information_schema.tables WHERE table_name = 'notifications'
UNION ALL SELECT 'tabla notification_preferences' FROM information_schema.tables WHERE table_name = 'notification_preferences'
UNION ALL SELECT 'profiles.personal_pin_hash' FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'personal_pin_hash'
UNION ALL SELECT 'clients.marketing_consent' FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'marketing_consent'
UNION ALL SELECT 'clients.marketing_consent_at' FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'marketing_consent_at'
UNION ALL SELECT 'clients.do_not_contact' FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'do_not_contact'
UNION ALL SELECT 'bucket client-photos privado' FROM storage.buckets WHERE id = 'client-photos' AND public = false;
