-- Renumerada: era 076 en el zip de suscripciones.
-- Plan anual = pago unico (Mercado Pago Checkout Pro), sin renovacion automatica.
-- El cron /api/cron/annual-renewals avisa antes del vencimiento con un link de pago.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;

-- 0 = sin aviso, 1 = aviso a 30 dias, 2 = a 7 dias, 3 = a 1 dia. Se reinicia al renovar.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_stage INT NOT NULL DEFAULT 0;
