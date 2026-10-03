-- 098: Interruptor "Apagar caja con PIN" por negocio. Aditiva y re-ejecutable. No cambia ni borra datos.
-- Apagado por defecto: sin activarlo, la Caja y el Punto de Venta funcionan como siempre (sin boton de apagar).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS caja_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 1 fila.
SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'caja_lock_enabled';
