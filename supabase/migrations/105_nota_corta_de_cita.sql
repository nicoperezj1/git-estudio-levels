-- 105: Nota corta del equipo para una cita (calendario). Aditiva y re-ejecutable.
-- appointments.notes sigue guardando lo que escribe el cliente al reservar (ej. su direccion); esta es aparte.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS staff_note TEXT;

-- Verificacion (debe devolver 1 fila):
SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'staff_note';
