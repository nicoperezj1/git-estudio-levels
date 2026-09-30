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
-- Renumerada: era 075 en el zip de suscripciones.
-- Precio por profesional adicional + suscripcion recurrente via Mercado Pago (Preapproval)
-- Nico + Pablo, 28-sep-2026 (ver doc de spec en Claude Docs para el diseno completo)

-- plan_limits: cada plan trae un cupo de profesionales incluido en price_clp; cada
-- profesional adicional (hasta max_professionals) suma extra_professional_price_clp/mes.
ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS included_professionals INT,
  ADD COLUMN IF NOT EXISTS extra_professional_price_clp INT NOT NULL DEFAULT 0;

-- Valores definidos en la landing (precios NETOS, sin IVA; el IVA 19% se suma al cobrar):
--   Basic:      $12.990, 1 profesional incluido (maximo 1)
--   Starter:    $26.990, 2 incluidos, +$5.000 por profesional adicional (maximo 5)
--   Pro:        $49.990, 6 incluidos, +$6.000 por profesional adicional (maximo 20)
--   Enterprise: $189.990, ilimitados (no es autoservicio, se cotiza por WhatsApp)
UPDATE plan_limits SET price_clp = 12990,  included_professionals = 1,  extra_professional_price_clp = 0,    max_professionals = 1   WHERE plan = 'basic';
UPDATE plan_limits SET price_clp = 26990,  included_professionals = 2,  extra_professional_price_clp = 5000, max_professionals = 5   WHERE plan = 'starter';
UPDATE plan_limits SET price_clp = 49990,  included_professionals = 6,  extra_professional_price_clp = 6000, max_professionals = 20  WHERE plan = 'pro';
UPDATE plan_limits SET price_clp = 189990, included_professionals = 999, extra_professional_price_clp = 0,   max_professionals = 999 WHERE plan = 'enterprise';
-- Cualquier otro plan queda sin cargo extra
UPDATE plan_limits SET included_professionals = max_professionals WHERE included_professionals IS NULL;

-- signup_requests: cuantos profesionales pidio el negocio, que ciclo de cobro elige,
-- y el id de la suscripcion (preapproval) creada en Mercado Pago.
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS professionals INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;

-- subscriptions: ya tiene status (trial|active|past_due|cancelled), amount y
-- current_period_end de antes -- solo faltan los campos de la suscripcion recurrente
-- de Mercado Pago y el plazo de gracia de una renovacion fallida.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
  ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ; -- fin del plazo de 2 dias si falla una renovacion

CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_preapproval ON subscriptions(mp_preapproval_id);
-- Renumerada: era 076 en el zip de suscripciones.
-- Plan anual = pago unico (Mercado Pago Checkout Pro), sin renovacion automatica.
-- El cron /api/cron/annual-renewals avisa antes del vencimiento con un link de pago.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;

-- 0 = sin aviso, 1 = aviso a 30 dias, 2 = a 7 dias, 3 = a 1 dia. Se reinicia al renovar.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_stage INT NOT NULL DEFAULT 0;
