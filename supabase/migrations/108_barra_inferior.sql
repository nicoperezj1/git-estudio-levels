-- 108: Barra inferior del celular personalizable. Aditiva y re-ejecutable.
--   profiles.mobile_tabs : atajos que eligio cada usuario (lista de claves, ej. ["calendario","pos"]); NULL = usa lo del negocio.
--   tenants.mobile_tabs  : atajos por defecto del negocio, por rol: {"admin":[...],"receptionist":[...],"barber":[...]}.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mobile_tabs JSONB;
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS mobile_tabs JSONB;

-- Verificacion (debe devolver 2 filas):
SELECT table_name || '.' || column_name AS ok FROM information_schema.columns
WHERE column_name = 'mobile_tabs' AND table_name IN ('profiles', 'tenants');
