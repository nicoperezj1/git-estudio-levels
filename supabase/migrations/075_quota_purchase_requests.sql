-- Complemento a 073/074: "Comprar mas" (Nico, 27-sep confirmo: flujo manual, no
-- integracion real con Mercado Pago todavia -- el equipo activa el cupo extra a mano una
-- vez que ve la solicitud, es mas rapido/barato de construir por ahora).
--
-- Un negocio que se quedo sin cupo (o esta por quedarse) pide mas desde el boton "Comprar
-- mas tokens" junto a la barra de uso; esto solo deja la solicitud registrada para que el
-- equipo la revise y suba manualmente whatsapp_quota_override/email_quota_override en
-- Superadmin > Negocios.
CREATE TABLE IF NOT EXISTS quota_purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  requested_by TEXT, -- nombre de quien lo pidio, para contexto en la revision
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quota_purchase_requests_status ON quota_purchase_requests(status, created_at);

ALTER TABLE quota_purchase_requests ENABLE ROW LEVEL SECURITY;
-- Sin policies de usuario final: se escribe desde el server con el cliente admin (el
-- tenant no necesita leer esta tabla directo), igual que audit_log/message_usage.
