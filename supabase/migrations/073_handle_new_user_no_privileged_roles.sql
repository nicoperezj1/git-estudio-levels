-- SEGURIDAD (27-sep): handle_new_user copiaba el rol desde raw_user_meta_data, que el
-- propio usuario controla al registrarse con la anon key publica
-- (supabase.auth.signUp({ options: { data: { role: "super_admin" } } })). Cualquiera
-- podia crearse una cuenta super_admin y ver todos los negocios.
--
-- Ahora un registro nunca obtiene un rol privilegiado desde la metadata: solo se respeta
-- 'client'; todo lo demas queda como 'barber' SIN negocio. Los roles reales (admin,
-- recepcion, super_admin) los fija el servidor con la service role despues de crear el
-- usuario (signup-business, /api/barberos, superadmin/tenants ya hacen update/upsert
-- del perfil con el rol correcto), asi que no dependen de este trigger.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role := 'barber';
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'client' THEN
    v_role := 'client';
  END IF;

  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
