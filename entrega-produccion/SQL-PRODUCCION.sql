-- SQL PARA PRODUCCION (re-booking). Correr TODO junto en el SQL Editor de PRODUCCION, despues de exportar un respaldo.
-- Incluye migraciones 086 a 099 en orden, SIN la 096 (Remuneraciones, queda para despues).
-- Todas son aditivas y re-ejecutables: si alguna ya estaba aplicada, no pasa nada.


-- ================= 086_profile_theme.sql =================
-- Tema (claro/oscuro) por usuario. NULL = usa el tema del negocio (tenants.theme, 070),
-- que sigue siendo el valor por defecto que elige el administrador. Aditiva y re-ejecutable.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_check CHECK (theme IS NULL OR theme IN ('light', 'dark'));


-- ================= 087_calendar_group_week.sql =================
-- Calendario "profesionales agrupados": el administrador puede activar que el selector
-- 1 / 3 / 7 dias aplique a todos sus profesionales a la vez (solo negocios de 2 a 4
-- profesionales; el limite lo controla la app). Apagado por defecto. Aditiva y re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_group_week BOOLEAN NOT NULL DEFAULT FALSE;


-- ================= 088_seguridad_roles_profiles.sql =================
-- 088: Cierra dos formas de escalar privilegios (aditiva y re-ejecutable).
--
-- 1) El trigger handle_new_user() tomaba el rol de raw_user_meta_data->>'role', que lo manda
--    el propio usuario al registrarse (el registro es publico): bastaba enviar role="super_admin".
--    Ahora el perfil automatico SIEMPRE nace como 'barber', sin negocio. Los flujos del servidor
--    (alta de negocio, superadmin, crear profesional, codigo de invitacion) ya fijan el rol y el
--    negocio explicitamente con la clave de servicio justo despues de crear el usuario.
-- 2) La politica profiles_update_own dejaba que cualquier usuario con sesion se cambiara a si
--    mismo role, tenant_id, PIN, comision, etc. con la clave publica. Se reemplaza por una con
--    WITH CHECK y un trigger que bloquea esas columnas cuando el cambio viene de un usuario
--    final. La clave de servicio (API del servidor) y el SQL Editor no se ven afectados.

-- ---------- 1) Perfil automatico sin confiar en el rol enviado por el usuario ----------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'barber'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 2) Un usuario solo puede editar su propia fila, y no las columnas sensibles ----------
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
  col TEXT;
  protected TEXT[] := ARRAY[
    'role', 'tenant_id', 'active', 'personal_pin', 'mp_access_token',
    'work_mode', 'commission_rate', 'rental_daily_rate', 'booking_slug'
  ];
BEGIN
  -- Clave de servicio (API del servidor) o SQL Editor / migraciones: sin restriccion.
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY protected LOOP
    IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
      RAISE EXCEPTION 'No tienes permiso para modificar la columna % del perfil', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_profile_sensitive_columns ON profiles;
CREATE TRIGGER tr_protect_profile_sensitive_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_sensitive_columns();

-- ---------- Verificacion (solo lectura) ----------
-- (a) El trigger ya no lee el rol del usuario: debe devolver 0 filas.

-- (b) Politica y trigger de proteccion presentes: debe devolver 2 filas.

-- (c) REVISAR A MANO: cuentas con rol super_admin. Tiene que aparecer SOLO la tuya y la de
--     Pablo. Si hay otra, alguien aprovecho el hueco: desactivala y cambia las claves.


-- ================= 089_profile_manager_name.sql =================
-- 089: "Nombre de encargado" para el cargo Recepcionista (saludo "Hola David" en Caja y POS).
-- Aditiva y re-ejecutable. No cambia ni borra datos existentes. El codigo tolera que la columna
-- aun no exista (el saludo simplemente no aparece).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Verificacion: debe devolver 1 fila (manager_name | text).


-- ================= 090_finanzas_fecha_contable.sql =================
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


-- ================= 091_libro_profesional.sql =================
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


-- ================= 092_inventario_compras.sql =================
-- 092: Fase 4 — inventario (venta / insumo), solicitud de insumos y proveedores. Aditiva y re-ejecutable.
-- NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla.
--
-- Todo producto que ya existe queda como 'sale' (Venta): sigue apareciendo en el POS exactamente como hoy.
-- Solo los marcados como 'supply' (Insumo) dejan de verse en el POS y pasan a la Solicitud de insumos.

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'sale';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('sale', 'supply'));
  END IF;
END $$;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;     -- cosmeticos, aseo, consumibles, generales o una propia

-- Categorias propias del negocio ("+ categoria"). Las 4 de base viven en el codigo.
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories ON product_categories(tenant_id, lower(name));
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;      -- sin politicas: solo la API (llave de servicio)

-- Correo al que llegan las solicitudes de insumos (lo elige el administrador).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS supply_request_email TEXT;

-- Solicitudes de insumos que levanta recepcion. Quedan en el Dashboard hasta que el administrador las borra.
CREATE TABLE IF NOT EXISTS supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID,
  created_by_name TEXT,
  items JSONB NOT NULL DEFAULT '[]',        -- [{ product_id, name, current_stock, to_buy }]
  notes TEXT,
  email_to TEXT,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by_name TEXT,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_supply_requests ON supply_requests(tenant_id, status, created_at DESC);
ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;

-- Proveedores del negocio (nombre del comercio y celular, escritos a mano).
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers ON suppliers(tenant_id, active);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 3 filas.


-- ================= 093_cupos_por_bloque.sql =================
-- 093: Cupos por bloque (solo kinesiologia). Cuantos clientes puede atender un profesional a la
-- vez en el mismo horario. 1 = como siempre (una cita por horario). La app solo permite cambiarlo
-- si el rubro del negocio es Kinesiologia. Aditiva y re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_clients_per_slot INTEGER NOT NULL DEFAULT 1;

-- Verificacion (solo lectura): todos los negocios deben partir en 1.


-- ================= 094_standby_caja.sql =================
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


-- ================= 095_mi_negocio_reservas.sql =================
-- 095: Fase 6 — Vacaciones de profesionales y reglas de "primer profesional disponible".
-- Aditiva y re-ejecutable. NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla.
--
-- La regla por defecto es 'least_agenda' = lo que hace hoy el boton (el profesional con menos citas del dia).
-- Volver a esa regla en Configuracion deja todo exactamente como hoy.

-- Vacaciones: rango de fechas por profesional. Bloquean la agenda y la reserva online.
CREATE TABLE IF NOT EXISTS professional_vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_vacations_barber ON professional_vacations(barber_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_vacations_tenant ON professional_vacations(tenant_id, end_date);
ALTER TABLE professional_vacations ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

-- Regla elegida por el negocio para asignar "primer profesional disponible".
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_rule TEXT NOT NULL DEFAULT 'least_agenda';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_booking_rule_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_booking_rule_check CHECK (booking_rule IN ('least_agenda', 'earliest_slot', 'target_share'));
  END IF;
END $$;
-- Mes (YYYY-MM) en que el admin ya vio / aplico la recomendacion por estadisticas (para el aviso del Dashboard).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_reco_month TEXT;

-- Por profesional: prioritario (regla 2) y % objetivo semanal (regla 3).
CREATE TABLE IF NOT EXISTS booking_rule_pros (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL,
  is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  target_pct INTEGER CHECK (target_pct IS NULL OR (target_pct >= 0 AND target_pct <= 100)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, barber_id)
);
ALTER TABLE booking_rule_pros ENABLE ROW LEVEL SECURITY;

-- Marca de las citas que se asignaron solas ("primer profesional disponible"); sirve para medir el cumplimiento semanal.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 2 filas.


-- ================= 097_ajustes_caja.sql =================
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


-- ================= 098_caja_bloqueo.sql =================
-- 098: Interruptor "Apagar caja con PIN" por negocio. Aditiva y re-ejecutable. No cambia ni borra datos.
-- Apagado por defecto: sin activarlo, la Caja y el Punto de Venta funcionan como siempre (sin boton de apagar).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS caja_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 1 fila.


-- ================= 099_ventana_reserva.sql =================
-- 099: Cuantos dias hacia adelante puede agendar el cliente (por negocio). Aditiva y re-ejecutable. No cambia ni borra datos.
-- NULL = como hasta ahora (14 dias en la vista por profesional, 28 en la vista por horario).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_window_days INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_booking_window_days_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_booking_window_days_check CHECK (booking_window_days IS NULL OR booking_window_days BETWEEN 1 AND 90);
  END IF;
END $$;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 1 fila.


-- ================= VERIFICACION (debe devolver 1 fila por cada item) =================
SELECT 'tenants.booking_window_days' AS item, count(*) FROM information_schema.columns WHERE table_name='tenants' AND column_name='booking_window_days'
UNION ALL SELECT 'tenants.booking_rule', count(*) FROM information_schema.columns WHERE table_name='tenants' AND column_name='booking_rule'
UNION ALL SELECT 'tenants.caja_lock_enabled', count(*) FROM information_schema.columns WHERE table_name='tenants' AND column_name='caja_lock_enabled'
UNION ALL SELECT 'tenants.max_clients_per_slot', count(*) FROM information_schema.columns WHERE table_name='tenants' AND column_name='max_clients_per_slot'
UNION ALL SELECT 'tabla cash_adjustments', count(*) FROM information_schema.tables WHERE table_name='cash_adjustments'
UNION ALL SELECT 'tabla cash_withdrawals', count(*) FROM information_schema.tables WHERE table_name='cash_withdrawals'
UNION ALL SELECT 'tabla problem_reports', count(*) FROM information_schema.tables WHERE table_name='problem_reports'
UNION ALL SELECT 'tabla payroll_discounts', count(*) FROM information_schema.tables WHERE table_name='payroll_discounts'
UNION ALL SELECT 'tabla professional_vacations', count(*) FROM information_schema.tables WHERE table_name='professional_vacations'
UNION ALL SELECT 'tabla professional_ledger', count(*) FROM information_schema.tables WHERE table_name='professional_ledger'
UNION ALL SELECT 'transactions.origin', count(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name='origin'
UNION ALL SELECT 'transactions.accounting_month', count(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name='accounting_month';
