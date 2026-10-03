-- 090: Fase 2 (finanzas). Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente.
-- Hacer un RESPALDO de la base antes de correrla.
--
-- 1) "Corresponde al mes" (fecha contable) y "Emitido por" en cada movimiento.
--    Los movimientos existentes quedan con accounting_month = NULL, y el codigo entiende
--    NULL como "el mes de su fecha de creacion": los informes de antes no cambian.
-- 2) Categoria de gasto fijo del mes (impuestos, luz, etc.): se guardan como egresos normales.
-- 3) Registro de cierre / reapertura de meses.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS accounting_month DATE;                       -- siempre dia 1 del mes
-- created_by SIN llave foranea a profiles, a proposito: transactions ya tiene barber_id -> profiles, y una
-- segunda relacion hace AMBIGUOS los `barber:profiles(name)` de Caja, Dashboard y Finanzas (PostgREST
-- PGRST201) y esas pantallas dejan de cargar. El nombre se resuelve con una consulta aparte.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID;
-- Si una version anterior de este archivo ya creo esa llave, se quita (re-ejecutable).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;
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

-- Verificacion (Supabase muestra solo el resultado de la ULTIMA consulta, por eso la importante va al final):
-- debe devolver UNA sola fila: transactions_barber_id_fkey.
SELECT conname FROM pg_constraint
WHERE conrelid = 'transactions'::regclass AND contype = 'f' AND confrelid = 'profiles'::regclass;
