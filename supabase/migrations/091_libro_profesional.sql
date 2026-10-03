-- 091: Fase 3 — libro de movimientos del profesional (Arriendo y Comision). Aditiva y re-ejecutable.
-- NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla.
--
-- Todo queda APAGADO por defecto: tenants.pro_ledger_enabled = false. Con el interruptor apagado,
-- Arriendo y Comisiones calculan EXACTAMENTE como hasta ahora. Se enciende por negocio desde
-- Configuracion, despues de comparar un mes en el sitio de prueba.
--
-- Convencion de signo del libro: effect = +1 "a favor del profesional", -1 "en contra del profesional".
--   Comision (el negocio paga):   total = comision + sum(effect * monto)
--   Arriendo (el profesional paga): total = arriendo - sum(effect * monto)
-- (asi una sola tabla alimenta las dos pantallas con la misma regla de signos).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pro_ledger_enabled BOOLEAN NOT NULL DEFAULT false;

-- Sin llave foranea a profiles: ver la leccion de created_by en 090 (relaciones extra a profiles rompen embeds).
CREATE TABLE IF NOT EXISTS professional_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  month DATE NOT NULL,                                   -- dia 1 del mes al que corresponde
  kind TEXT NOT NULL CHECK (kind IN ('money_in_favor', 'consumable', 'payroll_discount', 'advance', 'manual')),
  amount NUMERIC(12,0) NOT NULL CHECK (amount > 0),
  effect SMALLINT NOT NULL CHECK (effect IN (1, -1)),
  reason TEXT,
  created_by UUID,
  created_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_by_name TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professional_ledger ON professional_ledger(tenant_id, month, barber_id);
ALTER TABLE professional_ledger ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

-- Lo "cobrado" (arriendo) / "pagado" (comision) por profesional y mes: editable, con registro de quien lo cambio.
CREATE TABLE IF NOT EXISTS professional_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  month DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('commission', 'rental')),
  amount_paid NUMERIC(12,0) NOT NULL DEFAULT 0,
  days_override INTEGER,                                 -- arriendo: dias trabajados corregidos a mano (NULL = automatico)
  paid_at TIMESTAMPTZ,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, barber_id, month, mode)
);
ALTER TABLE professional_settlements ADD COLUMN IF NOT EXISTS days_override INTEGER;
-- Arriendo: los dias concretos elegidos en el calendario del mes (['2026-09-01', ...]). NULL = no se uso el calendario.
ALTER TABLE professional_settlements ADD COLUMN IF NOT EXISTS worked_dates JSONB;
-- Arriendo: valor del dia de ESTE mes si se cambio a mano (NULL = el valor habitual del profesional).
ALTER TABLE professional_settlements ADD COLUMN IF NOT EXISTS daily_rate_override NUMERIC(10,0);
ALTER TABLE professional_settlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS professional_settlement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  month DATE NOT NULL,
  mode TEXT NOT NULL,
  old_amount NUMERIC(12,0),
  new_amount NUMERIC(12,0) NOT NULL,
  note TEXT,
  user_id UUID,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professional_settlement_log ON professional_settlement_log(tenant_id, month, barber_id);
ALTER TABLE professional_settlement_log ENABLE ROW LEVEL SECURITY;

-- "Comision por venta" de cada producto: porcentaje del precio o monto fijo por unidad (la define el negocio).
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_commission_type TEXT;       -- 'percent' | 'fixed' | NULL (sin comision)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_commission_value NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 3 filas.
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('professional_ledger', 'professional_settlements', 'professional_settlement_log');
