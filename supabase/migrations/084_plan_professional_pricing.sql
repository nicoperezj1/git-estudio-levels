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
