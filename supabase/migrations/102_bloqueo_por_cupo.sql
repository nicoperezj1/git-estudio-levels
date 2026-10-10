-- 102: Bloqueos que ocupan solo algunos cupos (Kinesiologia con cupos por bloque). Aditiva y re-ejecutable.
-- NULL = el bloqueo ocupa todo el horario (como hasta ahora). 1 = ocupa un cupo y deja libres los demas.
ALTER TABLE barber_blocks ADD COLUMN IF NOT EXISTS spots INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barber_blocks_spots_check') THEN
    ALTER TABLE barber_blocks ADD CONSTRAINT barber_blocks_spots_check CHECK (spots IS NULL OR spots BETWEEN 1 AND 6);
  END IF;
END $$;

-- Verificacion (debe devolver 1 fila):
SELECT column_name FROM information_schema.columns WHERE table_name = 'barber_blocks' AND column_name = 'spots';
