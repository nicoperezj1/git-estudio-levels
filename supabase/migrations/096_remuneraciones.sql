-- 096: Fase 7 — Remuneraciones (liquidaciones de sueldo, solo trabajadores CON contrato).
-- Aditiva y re-ejecutable. Modulo NUEVO: no cambia ni borra nada existente. Hacer un RESPALDO antes de correrla.
-- Si no se usa, las tablas simplemente quedan vacias.
--
-- Ningun valor legal esta fijo en el codigo: UF, UTM, sueldo minimo, topes, tasas y tramos del impuesto
-- viven en payroll_params (por mes). tenant_id NULL = parametros globales cargados una vez por el super admin;
-- cada negocio los hereda y puede cargar los suyos.

CREATE TABLE IF NOT EXISTS employee_files (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'indefinido' CHECK (contract_type IN ('indefinido', 'plazo_fijo', 'obra')),
  hire_date DATE,
  weekly_hours NUMERIC(5,1) NOT NULL DEFAULT 44,
  base_salary NUMERIC(12,0) NOT NULL DEFAULT 0,
  afp_name TEXT,
  afp_rate NUMERIC(5,2) NOT NULL DEFAULT 0,             -- % total de la AFP (incluye su comision)
  health_system TEXT NOT NULL DEFAULT 'fonasa' CHECK (health_system IN ('fonasa', 'isapre')),
  isapre_plan_uf NUMERIC(8,3),                           -- TOTAL del plan de Isapre, en UF
  colacion NUMERIC(12,0) NOT NULL DEFAULT 0,
  movilizacion NUMERIC(12,0) NOT NULL DEFAULT 0,
  gratification_mode TEXT NOT NULL DEFAULT 'auto' CHECK (gratification_mode IN ('auto', 'manual', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, barber_id)
);
ALTER TABLE employee_files ENABLE ROW LEVEL SECURITY;    -- sin politicas: solo la API (llave de servicio)

CREATE TABLE IF NOT EXISTS payroll_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = globales
  month DATE NOT NULL,                                       -- primer dia del mes
  params JSONB NOT NULL DEFAULT '{}',
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_params ON payroll_params ((COALESCE(tenant_id::text, 'global')), month);
ALTER TABLE payroll_params ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
  inputs JSONB NOT NULL DEFAULT '{}',
  result JSONB NOT NULL DEFAULT '{}',
  net NUMERIC(12,0) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,0) NOT NULL DEFAULT 0,
  expense_tx_id UUID,                                       -- egreso "Remuneraciones" creado al pagar
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, barber_id, month)
);
CREATE INDEX IF NOT EXISTS idx_payslips_month ON payslips(tenant_id, month);
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- Identificacion del trabajador (seccion 2 de la plantilla): RUT, cargo y centro de costo.
ALTER TABLE employee_files ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE employee_files ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE employee_files ADD COLUMN IF NOT EXISTS cost_center TEXT;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 3 filas.
SELECT table_name FROM information_schema.tables WHERE table_name IN ('employee_files', 'payroll_params', 'payslips');
