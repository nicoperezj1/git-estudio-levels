-- Item 37 (Nico, 27-sep): onboarding inicial para negocios nuevos.
--
-- onboarding_completed (ya creada en la migracion 034): mientras sea false, el admin del
-- negocio es redirigido a /dashboard/onboarding en vez del dashboard normal.
-- onboarding_step: en que paso del wizard quedo (para poder cerrar la pestaña a mitad de
-- camino y retomar donde iba, en vez de reiniciar desde el paso 1).
--
-- Los negocios YA existentes (creados antes de este cambio) se marcan como completados de
-- entrada -- ya pasaron por su propia puesta en marcha manual, no tiene sentido mandarlos
-- al wizard de bienvenida.
--
-- SEGURIDAD AL RE-EJECUTAR: el marcado masivo solo ocurre la PRIMERA vez (cuando todavia no
-- existe onboarding_step). Si esta migracion se vuelve a correr despues, NO toca a los
-- negocios nuevos que aun no pasaron por el wizard.
alter table tenants add column if not exists onboarding_completed boolean not null default false;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'onboarding_step'
  ) then
    alter table tenants add column onboarding_step integer not null default 0;
    update tenants set onboarding_completed = true where onboarding_completed = false;
  end if;
end $$;
