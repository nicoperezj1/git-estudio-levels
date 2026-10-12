-- 110: Telefonos de la app movil que reciben avisos (notificaciones nativas por FCM/APNs).
-- Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes.
-- Sin la clave FIREBASE_SERVICE_ACCOUNT en Vercel el envio nativo queda apagado: la tabla puede existir sin efecto.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  tenant_id   UUID,
  token       TEXT NOT NULL UNIQUE,          -- token de FCM del telefono
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Solo se leen y escriben desde el servidor (igual que notifications): RLS activo sin politicas.
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Verificacion: debe devolver 1 fila.
SELECT 'tabla device_tokens' AS item FROM information_schema.tables WHERE table_name = 'device_tokens';
