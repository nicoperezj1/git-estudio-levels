-- Links personales cortos (Nico, 29-sep): re-booking.cl/<negocio>/<profesional>.
-- El indice unico de booking_slug era GLOBAL (062), asi que si dos salones tenian un
-- "javier" el segundo quedaba con sufijos feos ("javier-a1b2"). Como el link ya incluye
-- el slug del negocio, basta con que el slug del profesional sea unico DENTRO del negocio.
DROP INDEX IF EXISTS idx_profiles_booking_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_tenant_booking_slug
  ON profiles(tenant_id, booking_slug)
  WHERE booking_slug IS NOT NULL;
