-- 110: Seguimiento de publicidad (nivel 1). Para saber de que anuncio / campana vino cada reserva por link.
-- Funciona para TODOS los negocios: todo cuelga de tenant_id y viene APAGADO por defecto (interruptor por negocio).
--   tenants.ad_tracking_enabled     -> interruptor del negocio (false = no se guarda nada del anuncio).
--   appointments.ad_attribution     -> origen de ESA reserva: utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id, fbclid, landing, captured_at.
--   clients.first_ad_attribution    -> origen del cliente, fijado UNA vez al crearse por link (sirve para "clientes nuevos por campana").
-- Aditiva y re-ejecutable. El codigo tolera que falte esta migracion (no guarda nada y avisa "Falta aplicar la migracion 110").
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ad_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ad_attribution JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_ad_attribution JSONB;

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_ad_attr ON appointments (tenant_id, date) WHERE ad_attribution IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tenant_first_ad ON clients (tenant_id) WHERE first_ad_attribution IS NOT NULL;

-- Verificacion (debe devolver 3 filas: tenants.ad_tracking_enabled, appointments.ad_attribution, clients.first_ad_attribution):
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'tenants' AND column_name = 'ad_tracking_enabled')
   OR (table_name = 'appointments' AND column_name = 'ad_attribution')
   OR (table_name = 'clients' AND column_name = 'first_ad_attribution')
ORDER BY table_name;
