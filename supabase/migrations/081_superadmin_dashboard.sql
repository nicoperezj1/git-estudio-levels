-- Dashboard del Super Admin (Nico, 29-sep): ciudad de cada empresa, pasarela con la que paga
-- su suscripcion y comision (%) de cada pasarela para estimar lo que se lleva cada una.

-- Ciudad de la empresa (antes solo existia "direccion" en texto libre).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city TEXT;

-- Pasarela/medio con el que la empresa paga su suscripcion a re-booking
-- (mercadopago, transbank, transferencia, otro). NULL = sin definir.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_gateway TEXT;

-- Comision (%) que cobra cada pasarela. fee_pct NULL = aun no configurada (el dashboard
-- no inventa cifras: muestra "definir" hasta que el super admin la ingrese).
CREATE TABLE IF NOT EXISTS gateway_fees (
  gateway TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  fee_pct NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gateway_fees (gateway, label) VALUES
  ('mercadopago', 'Mercado Pago'),
  ('tuu', 'TUU'),
  ('transbank', 'Transbank'),
  ('transferencia', 'Transferencia')
ON CONFLICT (gateway) DO NOTHING;

ALTER TABLE gateway_fees ENABLE ROW LEVEL SECURITY;
-- Solo se accede desde el servidor (service role); sin politicas para usuarios normales.
