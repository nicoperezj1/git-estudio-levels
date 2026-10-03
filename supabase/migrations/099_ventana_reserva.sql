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
SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'booking_window_days';
