-- 102: Bloqueos que ocupan solo algunos cupos (Kinesiologia con cupos por bloque). Aditiva y re-ejecutable.
-- NULL = el bloqueo ocupa todo el horario (como hasta ahora). 1 = ocupa un cupo y deja libres los demas.
ALTER TABLE barber_blocks ADD COLUMN IF NOT EXISTS spots INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barber_blocks_spots_check') THEN
    ALTER TABLE barber_blocks ADD CONSTRAINT barber_blocks_spots_check CHECK (spots IS NULL OR spots BETWEEN 1 AND 6);
  END IF;
END $$;

-- 103: Mostrar la presentacion del negocio (banner, descripcion, mapa, horario) tambien cuando el cliente
-- entra por el link de un profesional o el negocio tiene un solo profesional. Aditiva y re-ejecutable.
-- false = como hasta ahora (el link directo pasa de inmediato a los servicios).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_show_profile_direct BOOLEAN NOT NULL DEFAULT false;


-- Verificacion (debe devolver 2 filas: spots y booking_show_profile_direct):
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'barber_blocks' AND column_name = 'spots')
   OR (table_name = 'tenants' AND column_name = 'booking_show_profile_direct');
