-- FIX (producción): no se pueden crear miembros del equipo (sale "{}").
--
-- CAUSA MÁS PROBABLE (la encontró la sesión de la Mac): falta la migración 080, la columna profiles.birth_date.
-- Al crear el miembro, el servidor guarda la fecha de nacimiento; sin esa columna falla y deshace la creación.
-- El código de la rama ya tolera su falta, pero la columna igual debe existir (la usa "Cumpleaños del mes").
--
-- PASO 1 (arreglo principal, seguro y re-ejecutable):
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- PASO 2 (endurecimiento de la 088; no cambia el comportamiento): fija el search_path de handle_new_user().
-- La 073 lo traía y la 088 original lo perdió; ya está corregido en el archivo 088 de la rama.
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

-- PASO 3 (verificación): debe devolver 1 fila (birth_date) y la función con {search_path=public}.
SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_date';
SELECT proname, proconfig FROM pg_proc WHERE proname = 'handle_new_user';
-- Luego probar en la web: Profesionales > Nuevo miembro.
--
-- Para saber si falta alguna OTRA migración, correr VERIFICAR-MIGRACIONES.sql (solo lee).
