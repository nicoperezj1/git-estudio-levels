# Entrega a producción: todo lo de octubre (rama `claude/hopeful-mayer-jtqlh4`)

Para: Pablo. De: Nico. Contiene todo lo trabajado desde el `main` de producción (`f7931c2`, 1 oct).
La rama de Nico está **por delante** de `main` (0 commits atrás), así que el merge es limpio.
Son 149 archivos. Incluye 1 dependencia nueva: `pdf-lib` (ya está en `package.json` y `package-lock.json`).

## Qué trae (resumen)
- Seguridad: login/roles de `profiles` (SQL 088), rutas de POS, caja, PIN y planilla ahora exigen sesión y negocio.
- Finanzas: "corresponde al mes", "emitido por" (origen del movimiento), cierre mensual, libro por profesional (SQL 090, 091).
- Inventario y compras, solicitud de insumos (SQL 092). El correo de solicitud depende de Resend (ver "Pendiente tuyo").
- Cupos por bloque (solo kinesiología) (SQL 093).
- Standby v2 (venta con PIN), reporte de problema de caja, reducción de efectivo, descuento por planilla, apagar caja con PIN (SQL 094, 097, 098). **Todo viene apagado por defecto**: cada negocio lo activa en Configuración > Caja y Standby.
- Menú "Mi negocio", Vacaciones, reglas de "Primer profesional disponible" (SQL 095).
- Días que el cliente puede agendar: 7/14/21/31 (SQL 099). Sin configurar, queda como antes (14 y 28 días).
- Remuneraciones: el código viene, pero el menú está **oculto** (solo super_admin) y su SQL (096) **NO** va en este paquete.

## Paso a paso
1. **Respaldo:** exporta la base de producción (Supabase > Database > Backups, o `pg_dump`).
2. **Trae el código** (en tu copia de `pdencina/barberia`):
   `git fetch https://github.com/nicoperezj1/git-estudio-levels.git claude/hopeful-mayer-jtqlh4`
   `git checkout main && git merge FETCH_HEAD`
   (debe ser fast-forward; si no lo fuera, resuelve y avísame).
3. **Instala dependencias:** `npm install` (por `pdf-lib`).
4. **SQL primero, código después:** abre el SQL Editor de **producción**, pega TODO `entrega-produccion/SQL-PRODUCCION.sql` y Run.
   - Es el mismo contenido de las migraciones 086 a 099 en orden, sin la 096. Son aditivas y re-ejecutables.
   - Al final devuelve una tabla con 12 filas; **todas** deben tener `count = 1`.
   - Si alguna migración ya estaba aplicada (086, 087, 088 pueden estarlo), no pasa nada.
5. **Despliega** (push a `main` / Vercel).
6. **Pruebas rápidas en producción**, con un negocio de prueba o el de Nico:
   - Reservar online por la vista de profesional y por la de horario.
   - Hacer una venta en el POS y ver que aparece en Caja con "Emitido por".
   - Configuración > Preferencias de reserva abre y guarda.
   - Dashboard y Finanzas cargan sin errores.
   - Revisar en Vercel > Logs que no haya errores 500 nuevos.
7. **Antes de abrir a los negocios**, compara en Finanzas el cierre de septiembre con lo que había antes (solo deben sumarse egresos marcados para septiembre).

## Vuelta atrás
- Código: `git revert` del merge (o redeploy del deploy anterior en Vercel).
- SQL: no hace falta deshacer; son columnas y tablas nuevas que el código viejo ignora.
  La única que toca algo existente es la 088 (política y trigger de `profiles`); si algo de login/roles falla, avísame antes de revertirla.

## Pendiente tuyo (no es código)
- Correo de solicitud de insumos: Resend lo acepta pero no llega. Revisar dominio verificado, la variable `EMAIL_FROM` (si no existe usa `no-reply@re-booking.cl`) y spam.
- Regenerar `MP_WEBHOOK_SECRET` y el token `APP_USR` que quedaron expuestos.
- Quedan abiertas las rutas `comisiones/adjust`, `arriendo/adjust`, `wallet`, `loyalty`, `mercadopago*`, `tuu*` (ver `docs/auditoria-rutas-api.md`).

## Parte 2 (SOLO cuando Nico avise; todavía en pruebas)
Rama `octubre` actualizada con: centro de avisos (campanita, avisos del admin al equipo), seguridad de citas/avisos/billetera/clientes, PIN con huella, fotos de clientes privadas y consentimiento de promociones. Trae **2 migraciones más** en `entrega-produccion/SQL-PARTE-2.sql` (100 y 101, aditivas), que van **después** de `SQL-PRODUCCION.sql` y antes del código nuevo. Todo viene apagado por defecto (el centro de avisos se enciende por negocio). Pasos extra tras desplegar, solo super admin:
1. `GET /api/superadmin/pin-backfill` y luego `POST` (completa las huellas de los PIN existentes).
2. `GET /api/superadmin/photos-migrate` y `POST` repetido hasta `pendientes: 0` (mueve las fotos antiguas de clientes al bucket privado).
3. Opcional, más adelante: borrar el PIN en claro (ver `docs/legal/REVISION-TECNICA.md`).
