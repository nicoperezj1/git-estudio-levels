-- Renumerada: era 074 en el zip de suscripciones (colisionaba con 074 de uso de mensajes).
-- Self-serve signup + subscription payments (Mercado Pago Checkout Pro)
-- A business fills the /suscribirse form (signup_requests, status=pending), pays via MP,
-- and only once the webhook confirms an approved payment do we provision the tenant
-- (see src/lib/tenant-provisioning.ts) and log the payment (subscription_payments).

CREATE TABLE IF NOT EXISTS signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  rut_empresa TEXT,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  phone TEXT,
  plan TEXT NOT NULL,
  amount INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, expired
  mp_preference_id TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests(status);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  signup_request_id UUID REFERENCES signup_requests(id),
  plan TEXT NOT NULL,
  amount INT NOT NULL,
  mp_payment_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant ON subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);

ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Ambas tablas solo las toca el servidor con la llave de servicio (createAdminSupabase),
-- nunca un usuario autenticado desde el navegador. Con RLS activo y SIN politicas, ningun
-- usuario logueado puede leerlas ni escribirlas; la llave de servicio se salta RLS.
DROP POLICY IF EXISTS "signup_requests_all" ON signup_requests;
DROP POLICY IF EXISTS "subscription_payments_all" ON subscription_payments;
