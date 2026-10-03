-- 093: Cupos por bloque (solo kinesiologia). Cuantos clientes puede atender un profesional a la
-- vez en el mismo horario. 1 = como siempre (una cita por horario). La app solo permite cambiarlo
-- si el rubro del negocio es Kinesiologia. Aditiva y re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_clients_per_slot INTEGER NOT NULL DEFAULT 1;

-- Verificacion (solo lectura): todos los negocios deben partir en 1.
SELECT max_clients_per_slot, COUNT(*) AS negocios FROM tenants GROUP BY max_clients_per_slot;
