-- 097: Control de efectivo en Standby — ajustes de caja y reportes con constancia. Aditiva y re-ejecutable.
-- NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla (en pruebas no hace falta).
--
-- Cuando el administrador revisa un reporte de caja, declara cuanto efectivo hay REALMENTE: la diferencia contra
-- lo que decia el sistema queda como un "ajuste de caja" (con su glosa), y desde ahi el efectivo esperado parte
-- del monto real. El ajuste puede ser positivo o negativo.

CREATE TABLE IF NOT EXISTS cash_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day DATE NOT NULL,                                -- dia (Chile) al que pertenece
  amount NUMERIC(12,0) NOT NULL,                    -- con signo: real - esperado (puede ser negativo)
  expected_cash NUMERIC(12,0),                      -- lo que decia el sistema
  declared_cash NUMERIC(12,0),                      -- lo que el administrador conto / declaro
  note TEXT NOT NULL,                               -- glosa de la solucion
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_adjustments ON cash_adjustments(tenant_id, day);
ALTER TABLE cash_adjustments ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

-- Reportes de problema con constancia: que mostraba la caja, si el profesional dejo su consentimiento y la solucion.
ALTER TABLE problem_reports ADD COLUMN IF NOT EXISTS shown_cash NUMERIC(12,0);
ALTER TABLE problem_reports ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE problem_reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE problem_reports ADD COLUMN IF NOT EXISTS declared_cash NUMERIC(12,0);

-- Origen de cada venta (standby / pos / manual): para que quien cierra la caja sepa de donde viene cada movimiento.
-- (transactions.created_by ya existe desde la 090: ahora tambien se llena en las ventas del POS y del Standby.)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS origin TEXT;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 1 fila.
SELECT table_name FROM information_schema.tables WHERE table_name = 'cash_adjustments';
