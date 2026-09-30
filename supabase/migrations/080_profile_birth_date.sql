-- Fecha de nacimiento de cada profesional/miembro del equipo (Nico, 29-sep).
-- Se usa para el aviso "Cumpleanos del mes" del Dashboard (solo administradores).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
