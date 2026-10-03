-- 089: "Nombre de encargado" para el cargo Recepcionista (saludo "Hola David" en Caja y POS).
-- Aditiva y re-ejecutable. No cambia ni borra datos existentes. El codigo tolera que la columna
-- aun no exista (el saludo simplemente no aparece).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Verificacion: debe devolver 1 fila (manager_name | text).
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'manager_name';
