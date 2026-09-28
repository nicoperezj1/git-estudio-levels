-- Item 37 (Nico, 27-sep): onboarding inicial para negocios nuevos.
--
-- onboarding_completed: mientras sea false, el admin del negocio es redirigido a
-- /dashboard/onboarding en vez del dashboard normal.
-- onboarding_step: en que paso del wizard quedo (para poder cerrar la pestaña a mitad de
-- camino y retomar donde iba, en vez de reiniciar desde el paso 1).
--
-- Los negocios YA existentes (creados antes de este cambio) se marcan como completados de
-- entrada -- ya pasaron por su propia puesta en marcha manual, no tiene sentido mandarlos
-- al wizard de bienvenida.
alter table tenants add column if not exists onboarding_completed boolean not null default false;
alter table tenants add column if not exists onboarding_step integer not null default 0;

update tenants set onboarding_completed = true where onboarding_completed = false;
