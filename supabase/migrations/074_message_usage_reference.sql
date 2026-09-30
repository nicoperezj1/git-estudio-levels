-- Complemento a 073_message_quotas.sql.
--
-- Problema encontrado al integrar WhatsApp: a diferencia del email (que se envia una sola
-- vez, en el momento exacto del cron/accion), el endpoint que arma los links de WhatsApp
-- (/api/cron/reminders/whatsapp) se vuelve a pedir cada vez que la pagina de Recordatorios
-- carga o el usuario cambia de fecha en el selector — mismas citas, mismo dia. Si cada
-- GET consumiera cupo de nuevo por cada cita, recargar la pagina un par de veces agotaria
-- el cupo de WhatsApp del mes sin haber enviado un solo mensaje real.
--
-- Solucion: cada mensaje que se puede repetir en el tiempo (recordatorio de una cita,
-- notificacion de retencion a un cliente) se identifica por una referencia estable
-- (appointment_id o client_id) y solo se descuenta cupo la PRIMERA vez que se ve esa
-- referencia en el ciclo actual; pedidos repetidos de la misma referencia se consideran
-- "ya contado" y no vuelven a insertar fila ni a descontar cupo.
ALTER TABLE message_usage ADD COLUMN IF NOT EXISTS reference_id UUID;
CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_channel_category_ref
  ON message_usage(tenant_id, channel, category, reference_id);
