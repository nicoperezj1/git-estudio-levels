-- =====================================================================================
-- MIGRACIONES 073 a 085 PARA PRODUCCION (un solo archivo, en orden)
-- =====================================================================================
-- Por que: el inventario de solo lectura mostro que produccion NO tiene las tablas de las
--   migraciones 073 (message_usage), 075 (quota_purchase_requests), 078 (client_documents),
--   081 (gateway_fees) ni 083 (signup_requests, subscription_payments), y tampoco las
--   columnas de la 080 a la 085. Este archivo las deja todas al dia.
--
-- Como usarlo (Supabase > SQL Editor > New query > pegar TODO > Run):
--   0. HACER RESPALDO ANTES (Database > Backups, o dump).
--   1. Va envuelto en BEGIN ... COMMIT: si algo falla, NO se aplica nada y la base queda
--      como estaba. Despues del COMMIT corre una consulta de verificacion de solo lectura.
--   2. Se puede correr ANTES de desplegar el codigo nuevo: solo agrega tablas y columnas
--      (aditivo), el codigo actual de produccion sigue funcionando igual.
--
-- Seguridad de re-ejecucion: todas usan IF NOT EXISTS / ON CONFLICT / guardas; ya se probo
--   correrlo dos veces sobre la base de pruebas sin errores.
--
-- Cambios de DATOS que hace (los conoce y decidio el dueno del producto):
--   * 073: cupos de mensajes solo donde estan vacios (no pisa cambios manuales).
--   * 076: deja la lista de funciones (features) de cada plan en plan_limits.
--   * 077: marca como "onboarding completado" a los negocios YA existentes (solo la 1a vez).
--   * 084: fija precios y profesionales incluidos por plan (Basic 12.990, Starter 26.990,
--          Pro 49.990 netos + IVA; Enterprise 189.990). Las suscripciones existentes NO
--          cambian de monto; afecta a los planes que se ofrecen desde ahora.
-- =====================================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 073_message_quotas.sql
-- ---------------------------------------------------------------------------
-- Pedido de Nico (27-sep): sistema de cuotas de mensajeria por negocio, similar a los
-- limites de uso de Claude — cada plan trae una cantidad de WhatsApp/correos por mes;
-- al agotarla se bloquea el envio hasta el proximo ciclo o hasta comprar mas.
--
-- Alcance confirmado con Nico: cuentan las confirmaciones/recordatorios de citas (email +
-- WhatsApp) y los envios masivos de retencion/marketing. NO cuentan boletas/recibos ni
-- notificaciones internas (bienvenida a un profesional, reseteo de clave).
--
-- Importante (hallazgo tecnico): WhatsApp en este sistema NUNCA se envia automaticamente
-- — todo lo que existe hoy son links wa.me que el staff abre y manda a mano desde su
-- propio WhatsApp (no hay integracion con WhatsApp Business API). Por eso lo unico que se
-- puede medir y bloquear del lado del servidor es la GENERACION del link (el momento en
-- que el sistema prepara ese mensaje para un destinatario especifico), no si la persona
-- realmente presiono "enviar" en su WhatsApp. Es la misma logica que usan sistemas
-- similares sin integracion directa: contar el mensaje "entregado para envio", no el
-- envio en si. Email si es 100% automatico (via Resend), asi que ahi se mide el envio
-- real.

-- Los limites de plan_limits.features ya insinuaban cupos de mensajeria como tags de
-- texto (ej. "whatsapp_400", "email_500" en la migracion 030) pero nunca fueron columnas
-- numericas usables en codigo. Se agregan como columnas propias, con los valores ya
-- alineados a la tabla de precios del landing (actualizada 27-sep: Basic 100/100,
-- Starter 150/250, Pro 500/600). NULL = ilimitado (Enterprise).
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS whatsapp_quota INT;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS email_quota INT;

UPDATE plan_limits SET whatsapp_quota = 100, email_quota = 100 WHERE plan = 'basic' AND whatsapp_quota IS NULL AND email_quota IS NULL;
UPDATE plan_limits SET whatsapp_quota = 150, email_quota = 250 WHERE plan = 'starter' AND whatsapp_quota IS NULL AND email_quota IS NULL;
UPDATE plan_limits SET whatsapp_quota = 500, email_quota = 600 WHERE plan = 'pro' AND whatsapp_quota IS NULL AND email_quota IS NULL;
-- Enterprise queda en NULL (ilimitado): es el valor por defecto de las columnas nuevas.
-- (Las actualizaciones de arriba solo rellenan cupos vacios: re-ejecutar no pisa cambios manuales.)

-- Override por negocio, mismo patron que tenants.max_professionals: NULL = usa el
-- default del plan. Le permite a Superadmin desacoplar la cuota del plan elegido (ej. un
-- caso especial acordado con el cliente).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_quota_override INT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_quota_override INT;

-- Un registro por cada mensaje que cuenta contra la cuota del negocio. Se usa para
-- calcular el consumo del ciclo actual (COUNT(*) WHERE created_at >= inicio del ciclo) en
-- vez de un contador que se pueda desincronizar, y de paso deja auditoria de que se
-- envio y cuando — igual que audit_log.
CREATE TABLE IF NOT EXISTS message_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  category TEXT NOT NULL, -- 'confirmation' | 'reminder' | 'retention'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_channel_date ON message_usage(tenant_id, channel, created_at);

ALTER TABLE message_usage ENABLE ROW LEVEL SECURITY;
-- Sin policies de usuario final: se escribe/lee siempre con el cliente admin desde el
-- servidor (igual que audit_log), nunca directo desde el navegador.


-- ---------------------------------------------------------------------------
-- 074_message_usage_reference.sql
-- ---------------------------------------------------------------------------
-- Complemento a 073_message_quotas.sql.
--
-- Problema encontrado al integrar WhatsApp: a diferencia del email (que se envia una sola
-- vez, en el momento exacto del cron/accion), el endpoint que arma los links de WhatsApp
-- (/api/cron/reminders/whatsapp) se vuelve a pedir cada vez que la pagina de Recordatorios
-- carga o el usuario cambia de fecha en el selector — mismas citas, mismo dia. Si cada
-- GET consumiera cupo de nuevo por cada cita, recargar la pagina un par de veces agotaria
-- el cupo de WhatsApp del mes sin haber enviado un solo mensaje real.
--
-- Solucion: cada mensaje que se puede repetir en el tiempo (recordatorio de una cita,
-- notificacion de retencion a un cliente) se identifica por una referencia estable
-- (appointment_id o client_id) y solo se descuenta cupo la PRIMERA vez que se ve esa
-- referencia en el ciclo actual; pedidos repetidos de la misma referencia se consideran
-- "ya contado" y no vuelven a insertar fila ni a descontar cupo.
ALTER TABLE message_usage ADD COLUMN IF NOT EXISTS reference_id UUID;
CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_channel_category_ref
  ON message_usage(tenant_id, channel, category, reference_id);


-- ---------------------------------------------------------------------------
-- 075_quota_purchase_requests.sql
-- ---------------------------------------------------------------------------
-- Complemento a 073/074: "Comprar mas" (Nico, 27-sep confirmo: flujo manual, no
-- integracion real con Mercado Pago todavia -- el equipo activa el cupo extra a mano una
-- vez que ve la solicitud, es mas rapido/barato de construir por ahora).
--
-- Un negocio que se quedo sin cupo (o esta por quedarse) pide mas desde el boton "Comprar
-- mas tokens" junto a la barra de uso; esto solo deja la solicitud registrada para que el
-- equipo la revise y suba manualmente whatsapp_quota_override/email_quota_override en
-- Superadmin > Negocios.
CREATE TABLE IF NOT EXISTS quota_purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  requested_by TEXT, -- nombre de quien lo pidio, para contexto en la revision
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quota_purchase_requests_status ON quota_purchase_requests(status, created_at);

ALTER TABLE quota_purchase_requests ENABLE ROW LEVEL SECURITY;
-- Sin policies de usuario final: se escribe desde el server con el cliente admin (el
-- tenant no necesita leer esta tabla directo), igual que audit_log/message_usage.


-- ---------------------------------------------------------------------------
-- 076_plan_features_matrix.sql
-- ---------------------------------------------------------------------------
-- Item 34 (Nico, 26-sep): "matriz de accesos por plan" — que modulo se oculta/bloquea
-- segun el plan (Basic/Starter/Pro/Enterprise), alineado a la tabla de precios real del
-- landing (public/landing-nuevo/index.html).
--
-- plan_limits.features ya existia (migraciones 028/030) pero quedo desalineada del
-- landing actual: por ejemplo Starter tenia "cash_register" y "loyalty", que el landing
-- marca explicitamente como NO incluidos en Starter ("Modulo de caja" e "Inventario y
-- fidelizacion" aparecen con X en esa columna). Tambien tenia tags de cupo de mensajeria
-- (whatsapp_400, email_500, etc.) que ya quedaron obsoletos con las columnas numericas
-- reales agregadas en la migracion 073 (whatsapp_quota/email_quota) — se sacan de aca para
-- no tener el mismo dato en dos formatos que se puedan desincronizar.
--
-- Fuente exacta (bullets ✓/× de cada tarjeta del landing, 26-sep):
--   Basic:      Agenda, WhatsApp/correo (ver quota), Reportes basicos, Informes IA.
--               NO: mensajes masivos, fichas de cliente, cupones, POS, caja, fidelizacion,
--               inventario, comisiones/arriendo, facturas, colores.
--   Starter:    + Reportes avanzados, mensajes masivos, fichas de cliente, cupones.
--               NO: POS, caja, inventario, fidelizacion, comisiones/arriendo, facturas.
--   Pro:        + POS, caja, fidelizacion, colores personalizados, comisiones/arriendo,
--               facturas, inventario.
--   Enterprise: + multi-sucursal, API, integraciones, soporte dedicado (features de
--               negocio/soporte, no todas aplican a un toggle de UI; se listan igual por
--               completitud del plan).
UPDATE plan_limits SET features = '["booking", "calendar", "reports_basic", "ai_weekly"]'
  WHERE plan = 'basic';

UPDATE plan_limits SET features = '["booking", "calendar", "reports_advanced", "ai_weekly", "whatsapp_bulk", "client_files", "coupons"]'
  WHERE plan = 'starter';

UPDATE plan_limits SET features = '["booking", "calendar", "reports_advanced", "ai_weekly", "whatsapp_bulk", "client_files", "coupons", "pos", "cash_register", "loyalty", "custom_colors", "commissions", "rental", "invoices", "inventory"]'
  WHERE plan = 'pro';

UPDATE plan_limits SET features = '["booking", "calendar", "reports_advanced", "ai_weekly", "whatsapp_bulk", "client_files", "coupons", "pos", "cash_register", "loyalty", "custom_colors", "commissions", "rental", "invoices", "inventory", "multi_branch", "api", "integrations", "dedicated_support", "onboarding", "sla", "account_manager", "custom_modules", "custom_reports", "backups", "training"]'
  WHERE plan = 'enterprise';


-- ---------------------------------------------------------------------------
-- 077_onboarding.sql
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 078_business_category_client_documents.sql
-- ---------------------------------------------------------------------------
-- Pedido de Nico (28-sep): (1) segmentar que tipo de negocio (rubro) usa re-booking, para
-- saber cuantos hay de barberia, estetica, peluqueria, manicure, clinica, etc.; (2) permitir
-- subir documentos (PDF/Word) en la ficha de un cliente, habilitable por negocio (pensado
-- para clinicas, kinesiologia, centros de estetica; para barberia no hace falta).

-- 1) Rubro del negocio. NULL = "sin clasificar" a proposito: los negocios que ya existen
--    no se asumen barberias, se clasifican a mano desde Superadmin.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category TEXT;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_business_category_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_business_category_check
  CHECK (business_category IS NULL OR business_category IN
    ('barberia', 'peluqueria', 'estetica', 'manicure', 'spa', 'clinica', 'kinesiologia', 'otro'));

-- 2) Interruptor por negocio para la carga de documentos en la ficha de cliente.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_files_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3) Documentos de cliente. RLS activado SIN policies: solo se lee/escribe desde el
--    servidor con el cliente admin (mismo patron que audit_log / message_usage), porque
--    pueden contener datos sensibles (ej. fichas clinicas).
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id, created_at DESC);
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- 4) Bucket PRIVADO (a diferencia de las fotos de cortes): los documentos se sirven solo
--    con links firmados temporales, nunca con una URL publica adivinable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 079_booking_slug_unique_per_tenant.sql
-- ---------------------------------------------------------------------------
-- Links personales cortos (Nico, 29-sep): re-booking.cl/<negocio>/<profesional>.
-- El indice unico de booking_slug era GLOBAL (062), asi que si dos salones tenian un
-- "javier" el segundo quedaba con sufijos feos ("javier-a1b2"). Como el link ya incluye
-- el slug del negocio, basta con que el slug del profesional sea unico DENTRO del negocio.
DROP INDEX IF EXISTS idx_profiles_booking_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_tenant_booking_slug
  ON profiles(tenant_id, booking_slug)
  WHERE booking_slug IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 080_profile_birth_date.sql
-- ---------------------------------------------------------------------------
-- Fecha de nacimiento de cada profesional/miembro del equipo (Nico, 29-sep).
-- Se usa para el aviso "Cumpleanos del mes" del Dashboard (solo administradores).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;


-- ---------------------------------------------------------------------------
-- 081_superadmin_dashboard.sql
-- ---------------------------------------------------------------------------
-- Dashboard del Super Admin (Nico, 29-sep): ciudad de cada empresa, pasarela con la que paga
-- su suscripcion y comision (%) de cada pasarela para estimar lo que se lleva cada una.

-- Ciudad de la empresa (antes solo existia "direccion" en texto libre).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city TEXT;

-- Pasarela/medio con el que la empresa paga su suscripcion a re-booking
-- (mercadopago, transbank, transferencia, otro). NULL = sin definir.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_gateway TEXT;

-- Comision (%) que cobra cada pasarela. fee_pct NULL = aun no configurada (el dashboard
-- no inventa cifras: muestra "definir" hasta que el super admin la ingrese).
CREATE TABLE IF NOT EXISTS gateway_fees (
  gateway TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  fee_pct NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gateway_fees (gateway, label) VALUES
  ('mercadopago', 'Mercado Pago'),
  ('tuu', 'TUU'),
  ('transbank', 'Transbank'),
  ('transferencia', 'Transferencia')
ON CONFLICT (gateway) DO NOTHING;

ALTER TABLE gateway_fees ENABLE ROW LEVEL SECURITY;
-- Solo se accede desde el servidor (service role); sin politicas para usuarios normales.


-- ---------------------------------------------------------------------------
-- 082_booking_preferences.sql
-- ---------------------------------------------------------------------------
-- 082: Preferencias de reservas (página pública del negocio)
-- Solo agrega columnas opcionales a tenants; no toca datos existentes. Re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_reviews_count INTEGER;
-- 'both' = pestañas (por horario / por profesional), 'time' = solo por horario, 'professional' = solo por profesional
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_view_mode TEXT NOT NULL DEFAULT 'professional';
DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_booking_view_mode_check CHECK (booking_view_mode IN ('time','professional','both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- 083_subscription_payments.sql
-- ---------------------------------------------------------------------------
-- Renumerada: era 074 en el zip de suscripciones (colisionaba con 074 de uso de mensajes).
-- Self-serve signup + subscription payments (Mercado Pago Checkout Pro)
-- A business fills the /suscribirse form (signup_requests, status=pending), pays via MP,
-- and only once the webhook confirms an approved payment do we provision the tenant
-- (see src/lib/tenant-provisioning.ts) and log the payment (subscription_payments).

CREATE TABLE IF NOT EXISTS signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  rut_empresa TEXT,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  phone TEXT,
  plan TEXT NOT NULL,
  amount INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, expired
  mp_preference_id TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests(status);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  signup_request_id UUID REFERENCES signup_requests(id),
  plan TEXT NOT NULL,
  amount INT NOT NULL,
  mp_payment_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant ON subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);

ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Ambas tablas solo las toca el servidor con la llave de servicio (createAdminSupabase),
-- nunca un usuario autenticado desde el navegador. Con RLS activo y SIN politicas, ningun
-- usuario logueado puede leerlas ni escribirlas; la llave de servicio se salta RLS.
DROP POLICY IF EXISTS "signup_requests_all" ON signup_requests;
DROP POLICY IF EXISTS "subscription_payments_all" ON subscription_payments;


-- ---------------------------------------------------------------------------
-- 084_plan_professional_pricing.sql
-- ---------------------------------------------------------------------------
-- Renumerada: era 075 en el zip de suscripciones.
-- Precio por profesional adicional + suscripcion recurrente via Mercado Pago (Preapproval)
-- Nico + Pablo, 28-sep-2026 (ver doc de spec en Claude Docs para el diseno completo)

-- plan_limits: cada plan trae un cupo de profesionales incluido en price_clp; cada
-- profesional adicional (hasta max_professionals) suma extra_professional_price_clp/mes.
ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS included_professionals INT,
  ADD COLUMN IF NOT EXISTS extra_professional_price_clp INT NOT NULL DEFAULT 0;

-- Valores definidos en la landing (precios NETOS, sin IVA; el IVA 19% se suma al cobrar):
--   Basic:      $12.990, 1 profesional incluido (maximo 1)
--   Starter:    $26.990, 2 incluidos, +$5.000 por profesional adicional (maximo 5)
--   Pro:        $49.990, 6 incluidos, +$6.000 por profesional adicional (maximo 20)
--   Enterprise: $189.990, ilimitados (no es autoservicio, se cotiza por WhatsApp)
UPDATE plan_limits SET price_clp = 12990,  included_professionals = 1,  extra_professional_price_clp = 0,    max_professionals = 1   WHERE plan = 'basic';
UPDATE plan_limits SET price_clp = 26990,  included_professionals = 2,  extra_professional_price_clp = 5000, max_professionals = 5   WHERE plan = 'starter';
UPDATE plan_limits SET price_clp = 49990,  included_professionals = 6,  extra_professional_price_clp = 6000, max_professionals = 20  WHERE plan = 'pro';
UPDATE plan_limits SET price_clp = 189990, included_professionals = 999, extra_professional_price_clp = 0,   max_professionals = 999 WHERE plan = 'enterprise';
-- Cualquier otro plan queda sin cargo extra
UPDATE plan_limits SET included_professionals = max_professionals WHERE included_professionals IS NULL;

-- signup_requests: cuantos profesionales pidio el negocio, que ciclo de cobro elige,
-- y el id de la suscripcion (preapproval) creada en Mercado Pago.
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS professionals INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;

-- subscriptions: ya tiene status (trial|active|past_due|cancelled), amount y
-- current_period_end de antes -- solo faltan los campos de la suscripcion recurrente
-- de Mercado Pago y el plazo de gracia de una renovacion fallida.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
  ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ; -- fin del plazo de 2 dias si falla una renovacion

CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_preapproval ON subscriptions(mp_preapproval_id);


-- ---------------------------------------------------------------------------
-- 085_annual_one_time_payments.sql
-- ---------------------------------------------------------------------------
-- Renumerada: era 076 en el zip de suscripciones.
-- Plan anual = pago unico (Mercado Pago Checkout Pro), sin renovacion automatica.
-- El cron /api/cron/annual-renewals avisa antes del vencimiento con un link de pago.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;

-- 0 = sin aviso, 1 = aviso a 30 dias, 2 = a 7 dias, 3 = a 1 dia. Se reinicia al renovar.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_stage INT NOT NULL DEFAULT 0;


COMMIT;

-- =====================================================================================
-- VERIFICACION (solo lectura): todo debe decir OK. Si algo dice FALTA, el COMMIT no se aplico.
-- =====================================================================================
SELECT chequeo, CASE WHEN ok THEN 'OK' ELSE 'FALTA' END AS estado FROM (VALUES
  ('tabla message_usage (073)',            to_regclass('public.message_usage') IS NOT NULL),
  ('tabla quota_purchase_requests (075)',  to_regclass('public.quota_purchase_requests') IS NOT NULL),
  ('tabla client_documents (078)',         to_regclass('public.client_documents') IS NOT NULL),
  ('tabla gateway_fees (081)',             to_regclass('public.gateway_fees') IS NOT NULL),
  ('tabla signup_requests (083)',          to_regclass('public.signup_requests') IS NOT NULL),
  ('tabla subscription_payments (083)',    to_regclass('public.subscription_payments') IS NOT NULL),
  ('tenants.onboarding_step (077)',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='onboarding_step')),
  ('profiles.birth_date (080)',            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='birth_date')),
  ('tenants.booking_view_mode (082)',      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='booking_view_mode')),
  ('plan_limits.included_professionals (084)', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan_limits' AND column_name='included_professionals')),
  ('subscriptions.mp_preapproval_id (084)',EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='mp_preapproval_id')),
  ('subscriptions.billing_period (085)',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='billing_period')),
  ('bucket client-documents (078)',        EXISTS (SELECT 1 FROM storage.buckets WHERE id='client-documents'))
) AS v(chequeo, ok);
