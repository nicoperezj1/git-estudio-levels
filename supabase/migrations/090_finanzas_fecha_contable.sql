-- 090: Fase 2 (finanzas). Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente.
-- Hacer un RESPALDO de la base antes de correrla.
--
-- 1) "Corresponde al mes" (fecha contable) y "Emitido por" en cada movimiento.
--    Los movimientos existentes quedan con accounting_month = NULL, y el codigo entiende
--    NULL como "el mes de su fecha de creacion": los informes de antes no cambian.
-- 2) Categoria de gasto fijo del mes (impuestos, luz, etc.): se guardan como egresos normales.
-- 3) Registro de cierre / reapertura de meses.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS accounting_month DATE;                       -- siempre dia 1 del mes
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fixed_category TEXT;                         -- NULL = movimiento normal

CREATE INDEX IF NOT EXISTS idx_transactions_accounting_month ON transactions(tenant_id, accounting_month);
-- Un solo gasto fijo por categoria y mes (los anulados no cuentan).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_fixed_expense
  ON transactions(tenant_id, accounting_month, fixed_category)
  WHERE fixed_category IS NOT NULL AND status = 'completed';

CREATE TABLE IF NOT EXISTS month_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month DATE NOT NULL,                                          -- dia 1 del mes
  action TEXT NOT NULL CHECK (action IN ('close', 'reopen')),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_month_closings ON month_closings(tenant_id, month, created_at DESC);
-- Sin politicas: solo la API (llave de servicio) lee y escribe esta tabla.
ALTER TABLE month_closings ENABLE ROW LEVEL SECURITY;

-- Verificacion: debe devolver 3 filas (las tres columnas nuevas) y month_closings = 1.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name IN ('accounting_month', 'created_by', 'fixed_category');
SELECT count(*) AS month_closings_existe FROM information_schema.tables WHERE table_name = 'month_closings';
