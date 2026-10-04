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
SELECT table_name || '.' || column_name AS columna
FROM information_schema.columns
WHERE (table_name = 'profiles' AND column_name = 'personal_pin_hash')
   OR (table_name = 'clients' AND column_name IN ('marketing_consent', 'marketing_consent_at', 'do_not_contact'));

-- (c) Fotos de clientes en un bucket PRIVADO. El bucket 'cut-photos' es publico a proposito (logos, avatares y fotos de
-- servicios se ven en la reserva online), asi que las fotos de clientes se mueven a uno aparte, servido con links temporales.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Verificacion del bucket: debe devolver 1 fila con public = false.
SELECT id, public FROM storage.buckets WHERE id = 'client-photos';
