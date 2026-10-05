-- 088: Cierra dos formas de escalar privilegios (aditiva y re-ejecutable).
--
-- 1) El trigger handle_new_user() tomaba el rol de raw_user_meta_data->>'role', que lo manda
--    el propio usuario al registrarse (el registro es publico): bastaba enviar role="super_admin".
--    Ahora el perfil automatico SIEMPRE nace como 'barber', sin negocio. Los flujos del servidor
--    (alta de negocio, superadmin, crear profesional, codigo de invitacion) ya fijan el rol y el
--    negocio explicitamente con la clave de servicio justo despues de crear el usuario.
-- 2) La politica profiles_update_own dejaba que cualquier usuario con sesion se cambiara a si
--    mismo role, tenant_id, PIN, comision, etc. con la clave publica. Se reemplaza por una con
--    WITH CHECK y un trigger que bloquea esas columnas cuando el cambio viene de un usuario
--    final. La clave de servicio (API del servidor) y el SQL Editor no se ven afectados.

-- ---------- 1) Perfil automatico sin confiar en el rol enviado por el usuario ----------
CREATE OR REPLACE FUNCTION handle_new_user()
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
-- Ojo: SET search_path = public es obligatorio (lo traia la 073). Sin eso, el servicio de acceso de Supabase ejecuta esta
-- funcion con otro search_path y falla al crear usuarios ("Database error creating new user").

-- ---------- 2) Un usuario solo puede editar su propia fila, y no las columnas sensibles ----------
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
  col TEXT;
  protected TEXT[] := ARRAY[
    'role', 'tenant_id', 'active', 'personal_pin', 'mp_access_token',
    'work_mode', 'commission_rate', 'rental_daily_rate', 'booking_slug'
  ];
BEGIN
  -- Clave de servicio (API del servidor) o SQL Editor / migraciones: sin restriccion.
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY protected LOOP
    IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
      RAISE EXCEPTION 'No tienes permiso para modificar la columna % del perfil', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_profile_sensitive_columns ON profiles;
CREATE TRIGGER tr_protect_profile_sensitive_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_sensitive_columns();

-- ---------- Verificacion (solo lectura) ----------
-- (a) El trigger ya no lee el rol del usuario: debe devolver 0 filas.
SELECT proname FROM pg_proc
WHERE proname = 'handle_new_user' AND prosrc ILIKE '%raw_user_meta_data->>''role''%';

-- (b) Politica y trigger de proteccion presentes: debe devolver 2 filas.
SELECT 'policy' AS tipo, policyname AS nombre FROM pg_policies
WHERE tablename = 'profiles' AND policyname = 'profiles_update_own'
UNION ALL
SELECT 'trigger', tgname FROM pg_trigger
WHERE tgname = 'tr_protect_profile_sensitive_columns' AND NOT tgisinternal;

-- (c) REVISAR A MANO: cuentas con rol super_admin. Tiene que aparecer SOLO la tuya y la de
--     Pablo. Si hay otra, alguien aprovecho el hueco: desactivala y cambia las claves.
SELECT p.id, p.name, p.email, p.role, p.tenant_id, p.created_at
FROM profiles p
WHERE p.role = 'super_admin'
ORDER BY p.created_at;
