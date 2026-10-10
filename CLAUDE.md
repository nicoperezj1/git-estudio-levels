# CLAUDE.md: re-booking / Estudio Levels (léelo al empezar)

Claude Code lee este archivo solo al abrir la carpeta. Detalle largo en `docs/CONTEXTO.md` (estado por fase), `docs/PLAN-OCTUBRE.md` (decisiones y vuelta atrás), `docs/PRUEBAS-FASES-5-7.md` (pruebas), `docs/auditoria-rutas-api.md` (seguridad de rutas) y `entrega-produccion/` (paquete para Pablo).

## 1. Quién es quién y cómo hablar
- **Nico** (Nicolás, `nicoperezj1`, barberiaestudiolevels@gmail.com) es el dueño de Estudio Levels. No programa: prueba en su Mac en `localhost:3000` y decide.
- **Pablo** (`pdencina`) es el desarrollador. Dueño del repo oficial `pdencina/barberia` (`main` = producción), de Vercel y del Supabase de producción. Corre el SQL a mano y despliega. Desde el 3 oct. Nico es **colaborador** de `pdencina/barberia` (puede subir ramas; nunca a `main`).
- Hablarle en **español, informal, simple y corto**. Avanzar programando, no explicando. **No preguntar lo que ya está decidido** (ver el plan).
- **Siempre pasos numerados y detallados** ("qué pego, dónde, qué debe salir"). Nico se molestó cuando mandé instrucciones sin detalle. Decir en qué ventana va cada comando.
- Pronombres neutros si no se conocen.

## 2. Método de trabajo (el que funcionó)
1. Nico pide algo. Se busca el código real antes de proponer; si está decidido en `docs/PLAN-OCTUBRE.md`, se hace.
2. Cambios **pequeños**, un commit por tema, `npx tsc --noEmit` limpio antes de cada commit. No correr `next build`.
3. **Todo lo nuevo viene apagado o igual que antes por defecto** (interruptor por negocio) cuando hay riesgo (dinero, caja, cobros).
4. El código **tolera que falte una migración** (reintenta sin las columnas nuevas y avisa "Falta aplicar la migración NNN").
5. SQL: migraciones **aditivas y re-ejecutables** (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`), entregadas como `.sql` con una consulta de verificación al final. Se prueban primero en Supabase **`rebooking-pruebas`**.
6. Al terminar cada cambio: commit con los trailers de abajo, `git push` **solo a la rama de trabajo**, y a Nico se le dan los pasos para probar (traer cambios, SQL si hay, qué mirar).
7. **Nunca** pedir ni pegar llaves/tokens/claves. No tocar `.env*`. No imprimir su contenido.
8. No crear PR salvo que Nico lo pida.
9. Informar con honestidad: qué se probó y qué no (en la web no había navegador ni base de datos; en la Mac sí puede correrse la app).

## 3. Repos, ramas y cómo llega el código a producción
- Repo de Nico: `https://github.com/nicoperezj1/git-estudio-levels`, rama de trabajo **`claude/hopeful-mayer-jtqlh4`** (todo el trabajo está ahí).
- Carpeta local de Nico en la Mac: **`~/barberia`**. OJO: su `origin` apunta al repo de **Pablo**, no al de Nico. Por eso siempre se usa la URL completa:
  - Traer: `git fetch https://github.com/nicoperezj1/git-estudio-levels.git claude/hopeful-mayer-jtqlh4 && git checkout -B claude/hopeful-mayer-jtqlh4 FETCH_HEAD`
  - Subir (solo si Nico lo pide o el flujo lo exige): `git push https://github.com/nicoperezj1/git-estudio-levels.git claude/hopeful-mayer-jtqlh4`
  - Entrega a Pablo: `git push https://github.com/pdencina/barberia.git claude/hopeful-mayer-jtqlh4:octubre` (rama `octubre` en su repo). **Nunca** subir a `main` de Pablo; él revisa, respalda, corre el SQL y mergea.
- **Producción** = `pdencina/barberia` `main`. Antes de cualquier tarea grande, comparar: `git fetch https://github.com/pdencina/barberia main`. Al 3 oct. el `main` (`f7931c2`) es ancestro de la rama (0 commits de atraso), así que el merge es limpio. Si Pablo cambió algo, traerlo y mergear.
- **Entrega a producción:** Nico sube la rama a `pdencina/barberia` como `octubre` (comando arriba; el repo de Nico es privado y Pablo no lo ve). Pablo revisa, respalda, corre el SQL y mergea a `main`. Guía para él: `entrega-produccion/LEEME-PABLO.md`. SQL: `entrega-produccion/SQL-PRODUCCION.sql` (migraciones 086–099 **sin la 096**). SQL antes que el código. Si se agrega algo después, se vuelve a correr el mismo `git push ...:octubre` y se le avisa.
- **Prohibido dañar producción:** 4 negocios reales, ~2.700 clientes. Nada destructivo, nada de datos de prueba hacia allá.

## 4. Entorno de pruebas
- Supabase de pruebas `rebooking-pruebas` (ref `ucwrdmwtlesayjxmlbve`); el `.env.local` de Nico ya apunta ahí. Negocio "Estudio Levels (pruebas)" id `0235d97a-6658-4a1c-be69-8c1341ac50ce` (plan Pro, 8 profesionales), slug de reserva `levels-pruebas-0xrf` → `localhost:3000/booking?tenant=levels-pruebas-0xrf`.
- Usuarios de prueba: ver el gestor de claves de Nico (no se guardan contraseñas ni PINs en el repo).
- Servidor local: en **una** ventana de Terminal `npm run dev`; otros comandos en otra pestaña. Si falla ("Cannot find the middleware module", pantalla rara, puerto 3000/3001 ocupado): detener, `rm -rf .next`, `npm run dev`.
- En la Mac (no web) Claude puede correr la app y los scripts directamente; aun así, nada de `next build` sin avisar.

## 5. Arquitectura y trampas que ya nos mordieron
- Next.js 14.1.3 App Router + TypeScript + Tailwind + Supabase (Vercel). Código en `src/`, SQL en `supabase/migrations/` (hoy hasta la **101**; 100 y 101 solo probadas en código, sin aplicar).
- Rutas API usan `createAdminSupabase()` (service key, se salta RLS): **cada ruta debe validar sesión y negocio** (`getCurrentUserRoleAndTenant`, `resolveTenantForRequest`, `isManagerLevel`). Nunca confiar en un `tenantId` del navegador.
- **Embeds de PostgREST:** si una tabla tiene 2+ FK a la misma tabla, `barber:profiles(name)` falla en silencio (lista vacía) → usar pista `profiles!barber_id(name)`. `transactions.created_by` **no** lleva FK a `profiles`.
- **Horas:** las citas se guardan como hora de Chile escrita como UTC; strings sin zona se leen con `parseWallClock` (`src/lib/wallclock.ts`). No usar `new Date("YYYY-MM-DDTHH:mm")` ni `toISOString()` para "hoy".
- Contabilidad: `accounting_month` ("corresponde al mes"), `fetchAllRows` (más de 1.000 filas), libro del profesional `professional_ledger`, regla de signos de comisión/arriendo en `src/lib/ledger.ts`.
- Caja: efectivo esperado = apertura + ingresos efectivo − egresos efectivo − retiros (`cash_withdrawals`) + ajustes (`cash_adjustments`); reportes de problema (`problem_reports`) en rojo hasta que el admin los resuelve con PIN. Standby v2 = mismo `PosScreen` con profesional fijo por PIN.
- Cupos por bloque (`tenants.max_clients_per_slot`) solo valen con `business_category = 'kinesiologia'`.
- Reservas: vacaciones (`professional_vacations`), reglas de "Primer profesional disponible" (`src/lib/booking-rules.ts`), ventana de días (`tenants.booking_window_days`, `src/lib/booking-window.ts`).
- Nómina: `src/lib/payroll.ts` + `payroll-data.ts`; **ningún valor legal fijo en el código** (UF, UTM, topes, tasas, tramos se cargan en "Parámetros del mes").

## 6. Estado al 3 oct. 2026 (noche)
**Hecho y probado por Nico en pruebas:** Fases 1 (casi), 2, 4 (salvo correo), 5 (Standby/POS/caja/planilla/apagar caja con PIN), cupos por bloque, orden de servicios, Vacaciones, días para agendar (7/14/21/31), editar clientes, selector de clientes con celular/correo.
**Hecho sin probar a fondo:** reglas de "Primer profesional disponible" (la lógica pasó script; Nico dijo "espero que funcione"), tarjeta del Dashboard "Reservas automáticas", "Recomendado por estadísticas".
**Guardado pero oculto:** **Remuneraciones (Fase 7)**: código listo, menú visible solo para super_admin, SQL 096 **no** va a producción aún. Pendiente: correr 096 en pruebas, cargar parámetros (Previred/SII), comparar septiembre con su Excel `Plantilla_Liquidacion_Sueldo_Chile.xlsx`. Para reactivarla: quitar el `minRole: "super_admin"` en `src/components/layout/sidebar.tsx` y descomentar la tarjeta en `src/app/dashboard/mi-negocio/page.tsx`; sumar la 096 a `SQL-PRODUCCION.sql`.
**Entregado a Pablo (esperando que lea):** paquete `entrega-produccion/`. Incluye todo hasta el commit "Cliente: Modificar datos en menú de 3 puntos".

## 7. Pendientes
- Que Pablo lea el mensaje, corra el SQL y despliegue; luego probar en producción (login admin y profesional por la migración 088, reserva online, venta en POS con "Emitido por", Configuración).
- Cita creada desde el calendario con cliente nuevo "no aparece": no se reprodujo; se agregaron avisos y bloqueo si falta elegir al cliente. **Si Nico vuelve a verlo, pedir el paso exacto y el mensaje rojo, y revisar `handleCreate` en `src/app/dashboard/calendario/page.tsx` y `POST /api/appointments`.**
- Fase 7 (ver arriba). Mi Billetera (vista del profesional) sigue con el cálculo antiguo. Libro de Remuneraciones/Previred (solo guía).
- Correo de solicitud de insumos (Resend: dominio/`EMAIL_FROM`/spam; Pablo). Regenerar `MP_WEBHOOK_SECRET` y token `APP_USR` expuestos (Pablo).
- Seguridad abierta (`docs/auditoria-rutas-api.md`; el 3 oct. se cerraron push, comisiones/arriendo adjust, wallet, loyalty rewards, clients POST/[id]/photos): `mercadopago*`, `tuu*`; `pos/checkout` aún confía en los totales del navegador (falta recálculo en servidor y verificar pago de Mercado Pago); `GET /api/clients/[id]` y `GET /api/clients` sin chequeo de rol; actualizar Next 14.1.3 (CVE).
- Opcional si Nico lo pide: SQL para dar "Emitido por" a 4 ventas de prueba antiguas (datos irrecuperables, solo cosmético); plan Isapre en $ vs UF.
- Fase 0 con Pablo: sitio de prueba en Vercel conectado a `rebooking-pruebas`; parche `0013` ya incluido en la rama.

## 7a. Avances del 3 oct. (noche), sin probar por Nico todavía
Pasos de prueba en `docs/PRUEBAS-3-OCT-NOCHE.md`. (1) Seguridad de rutas cerrada (push, ajustes, wallet, clientes, fotos, recompensas). (2) `pos/checkout` con verificación de totales en **modo comparación** (`src/lib/checkout-check.ts`; anota en auditoría `checkout_check`, filtro "Ventas a revisar", no cambia el cobro; pruebas: `npx tsx scripts/test-checkout-check.ts`). (3) Borradores legales en `docs/legal/` y `/privacidad` oculta tras `LEGAL_PAGES_ENABLED=1`. (4) Móvil: `MobileTabBar` (barra inferior por rol; "Más" abre el menú). Nada de esto está en la rama `octubre` de Pablo: hay que volver a subirla y avisarle. Siguiente sugerido: Fase 2 del plan móvil (centro de notificaciones: tablas `notifications`/`notification_preferences`, avisos del admin al equipo, aviso de planilla) y los hallazgos A de `docs/legal/REVISION-TECNICA.md`.

## 7a-2. Segunda tanda (4 oct.), sin probar por Nico todavía
Pasos en `docs/PRUEBAS-3-OCT-NOCHE.md` (sección "Segunda tanda", secciones E a I). Migraciones **100** (centro de avisos: `notifications`, `notification_preferences`, `tenants.notification_center_enabled`, apagado por defecto) y **101** (`profiles.personal_pin_hash`, `clients.marketing_consent/_at/do_not_contact`, bucket privado `client-photos`). Código: `src/lib/notify.ts` (único punto para avisar al equipo; sin el centro activado solo envía push como antes), `src/lib/push.ts`, `src/lib/pin.ts` (huella HMAC; rutas aceptan huella o valor), campanita en `components/layout/notification-bell.tsx`, página `/dashboard/avisos`, tarjeta en Configuración. También se cerraron `appointments` POST/PATCH/details. SQL para Pablo: `entrega-produccion/SQL-PARTE-2.sql` (NO correr hasta que Nico termine de probar). Pendiente tras probar: volver a subir `octubre` y avisar a Pablo, etapa 2 del PIN, y los hallazgos 5–12 de `docs/legal/REVISION-TECNICA.md`.

## 7b. Próximo proyecto: app móvil (propuesta, sin aprobar)
Plan completo en `docs/PLAN-APP-MOVIL.html` (también publicado como página): Capacitor sobre la misma app Next.js, disposición móvil por rol, centro de notificaciones (`notifications`, `notification_preferences`, `device_tokens`, FCM + web-push), Fase 0 de seguridad (cerrar `/api/push/send`, que hoy no pide sesión) y cumplimiento de la Ley 21.719 antes del 1 dic. 2026 (política de privacidad que hoy no existe, contrato de encargo, canal de derechos). Decisiones pendientes al final del plan.

## 7c. Estado al 7 oct. 2026 (tarde) — LÉELO PRIMERO
- **En producción (`pdencina/barberia` `main`):** PR #3 (importador), #4 (reserva), #5 (seguridad de rutas, caja/dashboard rápidos, Sucursales en "Viendo como") y #6 (móvil compacto, **Eliminar mi cuenta**, `/eliminar-cuenta`, pantalla de plan para la app, política de privacidad **apagada**, Face ID, `vercel.json` con funciones en **pdx1**). Nico mergea él mismo (a Claude el permiso le bloquea el clic de Merge).
- **Migraciones 100 y 101 NO están en producción** (nada en producción las usa aún; el código las tolera). Correrlas solo cuando se despliegue la campanita/PIN con huella/fotos privadas, con respaldo (Supabase hace uno diario) y OK explícito de Nico.
- **Medición en producción (Nico con sesión en Chrome, 7 oct.):** región ahora `gru1 -> pdx1`. Dashboard ~430-600 ms (antes 650-930), caja ~370-480 ms (antes 900-1.130), clientes/profesionales/servicios ~320-470 ms (sin cambio claro). Piso ~320 ms: falta mover la base a São Paulo o aceptar ese piso.
- **App móvil (Capacitor):** rama `app/respaldo` en el repo de Nico (copia sin el archivo de workflow) y `app/capacitor-base` local en el scratchpad. Probada en el simulador de iPhone; Android compila y está firmado (`app-tiendas/re-booking-android-1.0.aab`, fuera de git). Llave de firma en `~/Library/re-booking-keys/` (Nico debe respaldarla; nunca imprimir su clave). Guía completa: `docs/PUBLICAR-APP-TIENDAS.md` (rama de la app), sección 10.
- **Falta para publicar (Nico):** D-U-N-S y cuentas Apple (USD 99/año) y Google (USD 25), cuenta demo en producción, política de privacidad revisada por abogado y `NEXT_PUBLIC_LEGAL_PAGES_ENABLED=1`, `NEXT_PUBLIC_SUPPORT_EMAIL` en Vercel. **Falta construir (Claude):** avisos push nativos (necesitan llave APNs de Apple y proyecto Firebase) y capturas de las fichas. Antes de archivar en Xcode: `npx cap sync ios` SIN `CAP_SERVER_URL`.
- **Cuidado:** el token de Claude no tiene el permiso `workflow`; los push que incluyan `.github/workflows` se rechazan (por eso existe `app/respaldo`).

## 7d. Estado al 10 oct. 2026 (madrugada): pasarela de pago de re-booking
- **Pasarela funcionando en producción** (`www.re-booking.cl/suscribirse`): el 401/"invalid access token" era el token de Mercado Pago. Se creó una aplicación nueva con producto **Suscripciones** en la cuenta RE-BOOKING, se rotó `MP_PLATFORM_ACCESS_TOKEN` en Vercel y se redesplegó. Probado de punta a punta con Basic mensual ($15.458): cobro aprobado, cuenta creada, correo enviado, login, webhook 200, cancelación desde Plan y facturación. Errores que no son bugs: "Payer and collector cannot be the same user" (el email del formulario no puede ser la cuenta que cobra) y "La operación no acepta este medio de pago" (la Tarjeta Prepago de Mercado Pago no sirve para suscripciones; usar tarjeta bancaria de crédito/débito).
- **Pendiente en Vercel (Pablo/Nico):** `NEXT_PUBLIC_APP_URL=https://www.re-booking.cl` (hoy el correo de bienvenida lleva `barberia-kappa-weld.vercel.app`); borrar la variable `APP_USR` (token pegado por error); confirmar `MP_WEBHOOK_SECRET` tras registrar el webhook en modo productivo.
- **Código nuevo (sin desplegar):** pantalla `/cambiar-clave` obligatoria en el primer ingreso del administrador de negocios creados desde el 10 oct. (`dashboard/layout.tsx`; `clear-temp-password` ahora exige sesión); menú de plan **Basic** con módulos bloqueados (`basicLocked` en `sidebar.tsx`, solo Basic); correo de bienvenida con el estilo de los demás; URL por defecto `www.re-booking.cl`. **Antes de producción:** ver qué plan tienen los 4 negocios reales (los bloqueos de Basic ocultarían Punto de Venta, Boletas, etc.). El bloqueo es solo del menú: la dirección escrita a mano abre igual.
- **Ramas:** `main` de Pablo (`54fea25`, PR #6) NO es ancestro de esta rama: tiene copias con otro hash de varios commits y hay conflictos en 8 archivos (`admin-pin.ts`, `client-import.ts`, `privacidad/page.tsx`, `api/caja/route.ts`, `clients/[id]/photos/route.ts`, `clientes/page.tsx`, `mi-agenda/page.tsx`, `docs/auditoria-rutas-api.md`). Resolver a mano, archivo por archivo, antes de entregar `octubre`. En la rama de Nico en GitHub el push se hace sin el commit de `.github/workflows` (el token no tiene permiso `workflow`).

## 8. Commits
Terminar cada mensaje de commit con:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```
(No incluir identificadores de modelo ni de sesión de otra herramienta si no se piden.)
