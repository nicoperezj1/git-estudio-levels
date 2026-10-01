-- Tema (claro/oscuro) por usuario. NULL = usa el tema del negocio (tenants.theme, 070),
-- que sigue siendo el valor por defecto que elige el administrador. Aditiva y re-ejecutable.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_check CHECK (theme IS NULL OR theme IN ('light', 'dark'));
