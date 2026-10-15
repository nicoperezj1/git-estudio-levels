-- CAMPANITA DE AVISOS EN PRODUCCION (migracion 100). Hacer un RESPALDO antes (Supabase guarda uno diario).
-- Aditiva y re-ejecutable: no cambia ni borra datos. Todo queda APAGADO hasta que cada negocio lo active.
--
-- PASO 1 (solo lectura): corre ESTA consulta primero. Si NO devuelve filas con migracion '100', la 100 ya esta
--   aplicada y el problema es solo el interruptor (ver LEEME-CAMPANITA.md). Cada fila que devuelva es algo que falta.
WITH esperado(migracion, tipo, tabla, columna) AS (VALUES
('100','col','tenants','notification_center_enabled'),
('100','tabla','notifications',''),
('100','tabla','notification_preferences',''),
('101','col','clients','do_not_contact'),
('101','col','clients','marketing_consent'),
('101','col','clients','marketing_consent_at'),
('101','col','profiles','personal_pin_hash'),
('102','col','barber_blocks','spots'),
('103','col','tenants','booking_show_profile_direct'),
('104','tabla','client_sources',''),
('105','col','appointments','staff_note'),
('106','tabla','barber_breaks',''),
('106','col','barber_blocks','series_id'),
('107','tabla','support_tickets',''),
('108','col','profiles','mobile_tabs'),
('108','col','tenants','mobile_tabs'),
('109','col','plan_limits','seat_prices'),
('110','tabla','device_tokens',''),
('111','tabla','platform_meetings',''),
('112','col','tenants','ad_tracking_enabled'),
('112','col','appointments','ad_attribution'),
('112','col','clients','first_ad_attribution'))
SELECT * FROM (
  SELECT e.migracion, e.tipo, e.tabla, e.columna
  FROM esperado e
  LEFT JOIN information_schema.columns c ON e.tipo='col' AND c.table_schema='public' AND c.table_name=e.tabla AND c.column_name=e.columna
  LEFT JOIN information_schema.tables t ON e.tipo='tabla' AND t.table_schema='public' AND t.table_name=e.tabla
  WHERE (e.tipo='col' AND c.column_name IS NULL) OR (e.tipo='tabla' AND t.table_name IS NULL)
  UNION ALL
  SELECT '101','bucket','client-photos','' WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='client-photos')
) x ORDER BY 1,3,4;

-- PASO 2 (solo si el paso 1 mostro filas con migracion '100'): corre TODO el contenido de
--   supabase/migrations/100_notificaciones.sql  (copiar y pegar el archivo completo). Termina con una consulta de
--   verificacion que debe devolver 3 filas.
--
-- PASO 3: no es SQL. Entrar como administrador de Estudio Levels > Configuracion > "Avisos y notificaciones" >
--   marcar "Activar el centro de avisos". Aparece la campanita junto al nombre del negocio (menu lateral) o arriba
--   en el celular.
