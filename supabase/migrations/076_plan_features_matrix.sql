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
