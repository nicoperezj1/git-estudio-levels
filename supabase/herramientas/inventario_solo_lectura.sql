-- =====================================================================================
-- INVENTARIO DE SOLO LECTURA del proyecto de Supabase de re-booking
-- =====================================================================================
-- Que hace: lista que hay en el proyecto (tablas, filas, politicas, funciones, usuarios,
--           archivos, extensiones) para saber EXACTAMENTE que habria que mover o verificar.
-- Que NO hace: no modifica nada (solo SELECT) y NO muestra datos de clientes, correos,
--           telefonos ni contenido de ninguna tabla. Solo nombres y cantidades.
-- Como usarlo: pegar completo en Supabase > SQL Editor > Run. Devuelve UNA sola tabla con
--           tres columnas (seccion, nombre, detalle). Copiar el resultado (o exportar CSV).
-- =====================================================================================

SELECT seccion, nombre, detalle FROM (

  -- 1) Esquemas propios (fuera de los de sistema de Supabase): sirve para ver si hay
  --    cosas de otros productos mezcladas con re-booking.
  SELECT '01 Tablas' AS seccion,
         t.table_schema || '.' || t.table_name AS nombre,
         'filas=' || (xpath('/row/c/text()',
            query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name), false, true, '')
         ))[1]::text
         || ' | RLS=' || COALESCE((SELECT CASE WHEN c.relrowsecurity THEN 'si' ELSE 'NO' END
                                   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                   WHERE n.nspname = t.table_schema AND c.relname = t.table_name), '?')
         || ' | politicas=' || (SELECT count(*) FROM pg_policies p
                                WHERE p.schemaname = t.table_schema AND p.tablename = t.table_name) AS detalle
  FROM information_schema.tables t
  WHERE t.table_type = 'BASE TABLE'
    AND t.table_schema NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions',
                               'graphql','graphql_public','vault','pgsodium','pgsodium_masks','pgbouncer',
                               'supabase_functions','supabase_migrations','net','cron','_realtime','_analytics')

  UNION ALL
  -- 2) Funciones propias
  SELECT '02 Funciones', n.nspname || '.' || p.proname, 'argumentos=' || pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'

  UNION ALL
  -- 3) Disparadores (incluye los de auth.users, que son los que se olvidan al migrar)
  SELECT '03 Disparadores', n.nspname || '.' || c.relname || ' > ' || tg.tgname, 'funcion=' || pr.proname
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc pr ON pr.oid = tg.tgfoid
  WHERE NOT tg.tgisinternal
    AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))

  UNION ALL
  -- 4) Extensiones instaladas
  SELECT '04 Extensiones', extname, 'version=' || extversion FROM pg_extension

  UNION ALL
  -- 5) Usuarios de autenticacion (solo cantidades)
  SELECT '05 Usuarios (auth)', 'total', count(*)::text FROM auth.users
  UNION ALL
  SELECT '05 Usuarios (auth)', 'con email confirmado', count(*)::text FROM auth.users WHERE email_confirmed_at IS NOT NULL

  UNION ALL
  -- 6) Archivos subidos (Storage): por bucket, cantidad y tamano. Esto NO va en un dump de la base.
  SELECT '06 Storage', b.name,
         'publico=' || b.public::text
         || ' | archivos=' || (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id)::text
         || ' | MB=' || COALESCE((SELECT round(sum((o.metadata->>'size')::numeric) / 1048576.0, 1)
                                  FROM storage.objects o WHERE o.bucket_id = b.id)::text, '0')
  FROM storage.buckets b

  UNION ALL
  -- 7) Negocios (tenants) por estado: solo cantidades, sin nombres
  SELECT '07 Negocios (tenants)', COALESCE(status, 'sin estado'), count(*)::text
  FROM public.tenants GROUP BY status

  UNION ALL
  -- 8) Tareas programadas (pg_cron), si la extension existe
  SELECT '08 Cron de la base', 'pg_cron',
         CASE WHEN to_regclass('cron.job') IS NULL THEN 'no instalado'
              ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM cron.job', false, true, '')))[1]::text || ' tareas'
         END

  UNION ALL
  -- 9) Migraciones registradas por la herramienta de Supabase (si se uso; si se aplicaron
  --    a mano en el editor SQL, esto sale vacio y vale la seccion 10)
  SELECT '09 Migraciones registradas', 'cantidad',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'tabla no existe'
              ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM supabase_migrations.schema_migrations', false, true, '')))[1]::text
         END

  UNION ALL
  -- 10) Comprobacion directa de las migraciones 080 a 085 (existe lo que crean?)
  SELECT '10 Migraciones 080-085', v.migracion,
         CASE WHEN v.aplicada THEN 'APLICADA' ELSE 'FALTA' END
  FROM (VALUES
    ('080 profiles.birth_date',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='birth_date')),
    ('081 tenants.city / subscriptions.payment_gateway / gateway_fees',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='city')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='payment_gateway')
       AND to_regclass('public.gateway_fees') IS NOT NULL),
    ('082 tenants.booking_view_mode / banner_url',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='booking_view_mode')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='banner_url')),
    ('083 signup_requests / subscription_payments',
       to_regclass('public.signup_requests') IS NOT NULL AND to_regclass('public.subscription_payments') IS NOT NULL),
    ('084 plan_limits.included_professionals / subscriptions.mp_preapproval_id',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan_limits' AND column_name='included_professionals')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='mp_preapproval_id')),
    ('085 subscriptions.billing_period',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='billing_period'))
  ) AS v(migracion, aplicada)

) AS inventario
ORDER BY seccion, nombre;
