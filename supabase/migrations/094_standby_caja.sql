-- 094: Fase 5 — Standby nuevo, reportes de problema, reduccion de efectivo y descuento por planilla.
-- Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla.
--
-- Todo queda APAGADO por defecto: el Standby nuevo no se ve hasta que el administrador lo active en
-- Configuracion, y sin "tope de efectivo" no se pide ninguna reduccion.

-- Interruptor del Standby nuevo (apagado = queda el Standby de siempre).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS standby_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Tope de efectivo en caja antes de pedir una reduccion (NULL = sin tope). Es por negocio, porque la caja es por negocio.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cash_cap NUMERIC(12,0) CHECK (cash_cap IS NULL OR cash_cap > 0);
-- Profesional con contrato de trabajo (para el aviso del tope de 15% en descuentos por planilla).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_labor_contract BOOLEAN NOT NULL DEFAULT FALSE;

-- Reportes de problema (nota libre, ej. "faltan $10.000") que le llegan al administrador.
CREATE TABLE IF NOT EXISTS problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reported_by UUID,
  reported_by_name TEXT,
  context TEXT NOT NULL DEFAULT 'standby',          -- standby | reduccion_efectivo | otro
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_problem_reports ON problem_reports(tenant_id, status, created_at DESC);
ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

-- Retiros de efectivo a la caja fuerte. Se RESTAN del efectivo esperado de la caja del dia, para que cuadre.
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day DATE NOT NULL,                                -- dia (Chile) al que pertenece
  amount NUMERIC(12,0) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals ON cash_withdrawals(tenant_id, day);
ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;

-- Descuento por planilla: el profesional elige un producto y se genera un CODIGO; recien cuando
-- recepcion o el administrador lo ingresa se descuenta el stock y se anota en el libro del profesional.
CREATE TABLE IF NOT EXISTS payroll_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  barber_name TEXT,
  product_id UUID NOT NULL,
  product_name TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,0) NOT NULL,
  total NUMERIC(12,0) NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  over_limit BOOLEAN NOT NULL DEFAULT FALSE,        -- supero el 15% (solo trabajadores con contrato)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_discount_code ON payroll_discounts(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_payroll_discounts ON payroll_discounts(tenant_id, status, created_at DESC);
ALTER TABLE payroll_discounts ENABLE ROW LEVEL SECURITY;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 3 filas.
SELECT table_name FROM information_schema.tables WHERE table_name IN ('problem_reports', 'cash_withdrawals', 'payroll_discounts');
