-- Pedido de Nico (27-sep): sistema de cuotas de mensajeria por negocio, similar a los
-- limites de uso de Claude — cada plan trae una cantidad de WhatsApp/correos por mes;
-- al agotarla se bloquea el envio hasta el proximo ciclo o hasta comprar mas.
--
-- Alcance confirmado con Nico: cuentan las confirmaciones/recordatorios de citas (email +
-- WhatsApp) y los envios masivos de retencion/marketing. NO cuentan boletas/recibos ni
-- notificaciones internas (bienvenida a un profesional, reseteo de clave).
--
-- Importante (hallazgo tecnico): WhatsApp en este sistema NUNCA se envia automaticamente
-- — todo lo que existe hoy son links wa.me que el staff abre y manda a mano desde su
-- propio WhatsApp (no hay integracion con WhatsApp Business API). Por eso lo unico que se
-- puede medir y bloquear del lado del servidor es la GENERACION del link (el momento en
-- que el sistema prepara ese mensaje para un destinatario especifico), no si la persona
-- realmente presiono "enviar" en su WhatsApp. Es la misma logica que usan sistemas
-- similares sin integracion directa: contar el mensaje "entregado para envio", no el
-- envio en si. Email si es 100% automatico (via Resend), asi que ahi se mide el envio
-- real.

-- Los limites de plan_limits.features ya insinuaban cupos de mensajeria como tags de
-- texto (ej. "whatsapp_400", "email_500" en la migracion 030) pero nunca fueron columnas
-- numericas usables en codigo. Se agregan como columnas propias, con los valores ya
-- alineados a la tabla de precios del landing (actualizada 27-sep: Basic 100/100,
-- Starter 150/250, Pro 500/600). NULL = ilimitado (Enterprise).
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS whatsapp_quota INT;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS email_quota INT;

UPDATE plan_limits SET whatsapp_quota = 100, email_quota = 100 WHERE plan = 'basic';
UPDATE plan_limits SET whatsapp_quota = 150, email_quota = 250 WHERE plan = 'starter';
UPDATE plan_limits SET whatsapp_quota = 500, email_quota = 600 WHERE plan = 'pro';
UPDATE plan_limits SET whatsapp_quota = NULL, email_quota = NULL WHERE plan = 'enterprise';

-- Override por negocio, mismo patron que tenants.max_professionals: NULL = usa el
-- default del plan. Le permite a Superadmin desacoplar la cuota del plan elegido (ej. un
-- caso especial acordado con el cliente).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_quota_override INT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_quota_override INT;

-- Un registro por cada mensaje que cuenta contra la cuota del negocio. Se usa para
-- calcular el consumo del ciclo actual (COUNT(*) WHERE created_at >= inicio del ciclo) en
-- vez de un contador que se pueda desincronizar, y de paso deja auditoria de que se
-- envio y cuando — igual que audit_log.
CREATE TABLE IF NOT EXISTS message_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  category TEXT NOT NULL, -- 'confirmation' | 'reminder' | 'retention'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_channel_date ON message_usage(tenant_id, channel, created_at);

ALTER TABLE message_usage ENABLE ROW LEVEL SECURITY;
-- Sin policies de usuario final: se escribe/lee siempre con el cliente admin desde el
-- servidor (igual que audit_log), nunca directo desde el navegador.
