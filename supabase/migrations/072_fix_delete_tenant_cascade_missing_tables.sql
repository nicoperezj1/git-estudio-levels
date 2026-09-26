-- Fix (reportado por Nico, 26-sep): al probar "Eliminar empresa" en Superadmin sobre un
-- negocio de prueba, la funcion delete_tenant_cascade (migracion 071) fallo con:
--   "relation 'gallery_images' does not exist"
-- gallery_images nunca se creo con CREATE TABLE en ninguna migracion de este repo (solo
-- aparece en un ALTER TABLE en la migracion 046, que le agrega tenant_id) — en este
-- proyecto en particular la tabla no existe en produccion. Como toda la funcion corre en
-- una transaccion implicita, esto abortaba el borrado completo (rollback), tal como estaba
-- disenado, pero bloqueaba limpiar cualquier negocio de prueba.
--
-- En vez de adivinar cuales de las ~30 tablas que toca la funcion existen realmente en
-- produccion, se hace robusta a cualquier tabla faltante: cada DELETE se ejecuta con SQL
-- dinamico solo si to_regclass() confirma que la tabla existe en este momento. Si una
-- tabla no existe, simplemente se omite ese paso (no hay nada que borrar ahi). El resto de
-- la logica (orden de borrado, alcance por tenant_id) queda igual que en la migracion 071.
CREATE OR REPLACE FUNCTION delete_tenant_cascade(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1) Tablas que dependen de transacciones/citas/clientes/profesionales pero NO tienen
  --    ON DELETE CASCADE hacia esas tablas (hay que vaciarlas antes de poder borrar sus
  --    "padres" mas abajo).
  IF to_regclass('public.loyalty_points') IS NOT NULL THEN
    EXECUTE 'DELETE FROM loyalty_points WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  IF to_regclass('public.mp_payment_intents') IS NOT NULL THEN
    EXECUTE 'DELETE FROM mp_payment_intents
      WHERE barber_id IN (SELECT id FROM profiles WHERE tenant_id = $1)
         OR transaction_id IN (SELECT id FROM transactions WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  IF to_regclass('public.tuu_payment_intents') IS NOT NULL THEN
    EXECUTE 'DELETE FROM tuu_payment_intents WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  IF to_regclass('public.boletas_emitidas') IS NOT NULL THEN
    EXECUTE 'DELETE FROM boletas_emitidas
      WHERE transaction_id IN (SELECT id FROM transactions WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  IF to_regclass('public.commissions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM commissions WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  IF to_regclass('public.reviews') IS NOT NULL THEN
    EXECUTE 'DELETE FROM reviews
      WHERE client_id IN (SELECT id FROM clients WHERE tenant_id = $1)
         OR barber_id IN (SELECT id FROM profiles WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  -- client_photos referencia appointment_id sin cascade: hay que vaciarla antes de
  -- borrar appointments (paso 3), no solo antes de clients.
  IF to_regclass('public.client_photos') IS NOT NULL THEN
    EXECUTE 'DELETE FROM client_photos
      WHERE client_id IN (SELECT id FROM clients WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  -- waitlist no tiene tenant_id propio (gap pre-existente, no corregido aqui) — se acota
  -- por barber_id o por el servicio, que si son del tenant.
  IF to_regclass('public.waitlist') IS NOT NULL THEN
    EXECUTE 'DELETE FROM waitlist
      WHERE barber_id IN (SELECT id FROM profiles WHERE tenant_id = $1)
         OR service_id IN (SELECT id FROM services WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  -- 2) Transacciones y citas. Sus hijos directos (transaction_items,
  --    transaction_payments, split_payments, appointment_services) SI tienen
  --    ON DELETE CASCADE hacia transactions/appointments y se limpian solos.
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM transactions WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.appointments') IS NOT NULL THEN
    EXECUTE 'DELETE FROM appointments WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- 3) Resto de tablas con tenant_id propio.
  IF to_regclass('public.inventory_movements') IS NOT NULL THEN
    EXECUTE 'DELETE FROM inventory_movements WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.loyalty_rewards') IS NOT NULL THEN
    EXECUTE 'DELETE FROM loyalty_rewards WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.loyalty_config') IS NOT NULL THEN
    EXECUTE 'DELETE FROM loyalty_config WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.rental_records') IS NOT NULL THEN
    EXECUTE 'DELETE FROM rental_records WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.cash_register') IS NOT NULL THEN
    EXECUTE 'DELETE FROM cash_register WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.business_hours') IS NOT NULL THEN
    EXECUTE 'DELETE FROM business_hours WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.coupons') IS NOT NULL THEN
    EXECUTE 'DELETE FROM coupons WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.price_history') IS NOT NULL THEN
    EXECUTE 'DELETE FROM price_history WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  -- gallery_images: no existe en produccion en este proyecto (ver nota arriba) — se omite
  -- sola gracias al chequeo to_regclass, sin necesidad de un caso especial.
  IF to_regclass('public.gallery_images') IS NOT NULL THEN
    EXECUTE 'DELETE FROM gallery_images WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'DELETE FROM invoices WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.booking_metrics') IS NOT NULL THEN
    EXECUTE 'DELETE FROM booking_metrics WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- La tabla `gallery` (vieja, distinta de `gallery_images`) referencia services sin
  -- cascade — hay que vaciarla antes de borrar `services` en el paso 4, no alcanza con
  -- dejar que cascade via profiles mas abajo (eso pasaria demasiado tarde).
  IF to_regclass('public.gallery') IS NOT NULL THEN
    EXECUTE 'DELETE FROM gallery
      WHERE barber_id IN (SELECT id FROM profiles WHERE tenant_id = $1)'
      USING p_tenant_id;
  END IF;

  -- 4) Catalogo del negocio.
  IF to_regclass('public.services') IS NOT NULL THEN
    EXECUTE 'DELETE FROM services WHERE tenant_id = $1' USING p_tenant_id;
  END IF;
  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'DELETE FROM products WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- 5) Clientes (cascada: client_notes, y cualquier client_photos remanente).
  IF to_regclass('public.clients') IS NOT NULL THEN
    EXECUTE 'DELETE FROM clients WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- 6) Profesionales/usuarios del tenant. Todo lo que cuelga de profiles con
  --    ON DELETE CASCADE (barber_blocks, barber_schedule, barber_services,
  --    barber_service_assignments, push_subscriptions, login_sessions) se limpia solo.
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM profiles WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- 7) Sucursales (nada relevante deberia seguir apuntando a ellas a esta altura).
  IF to_regclass('public.branches') IS NOT NULL THEN
    EXECUTE 'DELETE FROM branches WHERE tenant_id = $1' USING p_tenant_id;
  END IF;

  -- 8) El tenant. Cascada automatica: tenant_settings, subscriptions, invite_codes,
  --    mp_terminals, tuu_terminals (todas tienen ON DELETE CASCADE directo a tenants).
  DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;
