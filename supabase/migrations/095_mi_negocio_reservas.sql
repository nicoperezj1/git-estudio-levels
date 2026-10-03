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
SELECT table_name FROM information_schema.tables WHERE table_name IN ('professional_vacations', 'booking_rule_pros');
