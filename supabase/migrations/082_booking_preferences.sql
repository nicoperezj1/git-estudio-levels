-- 082: Preferencias de reservas (página pública del negocio)
-- Solo agrega columnas opcionales a tenants; no toca datos existentes. Re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_reviews_count INTEGER;
-- 'both' = pestañas (por horario / por profesional), 'time' = solo por horario, 'professional' = solo por profesional
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_view_mode TEXT NOT NULL DEFAULT 'professional';
DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_booking_view_mode_check CHECK (booking_view_mode IN ('time','professional','both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
