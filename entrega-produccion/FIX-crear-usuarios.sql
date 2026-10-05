-- FIX URGENTE (producción): no se pueden crear usuarios ("{}" / "Database error creating new user").
-- Sospecha: la migración 088 reemplazó handle_new_user() SIN "SET search_path = public" (la 073 sí lo tenía).
-- Solo lee en el paso 1 y reemplaza una función en el paso 2. Es seguro y re-ejecutable.

-- PASO 1 (diagnóstico): mira la columna proconfig.
--   Si dice NULL (vacía), falta el search_path y esta es la causa probable.
--   Si dice {search_path=public}, la causa es otra: mira Logs > Auth en Supabase.
SELECT proname, proconfig, prosecdef AS security_definer
FROM pg_proc WHERE proname = 'handle_new_user';

-- PASO 2 (arreglo):
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'barber'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- PASO 3 (verificación): ahora proconfig debe decir {search_path=public}.
SELECT proname, proconfig FROM pg_proc WHERE proname = 'handle_new_user';
-- Luego probar en la web: Profesionales > Nuevo miembro.
