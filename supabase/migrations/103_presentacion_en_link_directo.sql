-- 103: Mostrar la presentacion del negocio (banner, descripcion, mapa, horario) tambien cuando el cliente
-- entra por el link de un profesional o el negocio tiene un solo profesional. Aditiva y re-ejecutable.
-- false = como hasta ahora (el link directo pasa de inmediato a los servicios).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_show_profile_direct BOOLEAN NOT NULL DEFAULT false;

-- Verificacion (debe devolver 1 fila):
SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'booking_show_profile_direct';
