-- 106: (1) Varios breaks por dia con nombre y, en negocios con cupos por bloque, cuantos cupos cierran.
--      (2) Bloqueos repetidos: series_id agrupa las filas de barber_blocks creadas de una vez.
-- Aditiva y re-ejecutable. Los breaks que ya existen en barber_schedule (break_start/break_end) se copian
-- una sola vez; barber_schedule sigue guardando el primer break del dia (compatibilidad).
CREATE TABLE IF NOT EXISTS barber_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  name TEXT,
  spots INTEGER CHECK (spots IS NULL OR spots BETWEEN 1 AND 6),   -- NULL = cierra todos los cupos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_barber_breaks_barber ON barber_breaks(barber_id, day_of_week);
ALTER TABLE barber_breaks ENABLE ROW LEVEL SECURITY;   -- sin politicas: solo la API (llave de servicio)

INSERT INTO barber_breaks (barber_id, day_of_week, start_time, end_time, name)
SELECT s.barber_id, s.day_of_week, s.break_start, s.break_end, 'Break'
FROM barber_schedule s
WHERE s.break_start IS NOT NULL AND s.break_end IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM barber_breaks b WHERE b.barber_id = s.barber_id AND b.day_of_week = s.day_of_week);

ALTER TABLE barber_blocks ADD COLUMN IF NOT EXISTS series_id UUID;
CREATE INDEX IF NOT EXISTS idx_barber_blocks_series ON barber_blocks(series_id) WHERE series_id IS NOT NULL;

-- Verificacion (debe devolver 2 filas):
SELECT table_name || '.' || column_name AS ok FROM information_schema.columns
WHERE (table_name = 'barber_breaks' AND column_name = 'spots') OR (table_name = 'barber_blocks' AND column_name = 'series_id');
