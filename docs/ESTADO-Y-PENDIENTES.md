# re-booking: estado del código y qué falta (2 de octubre de 2026)

> **Aviso (contrastado con producción `pdencina/barberia` `main`, 2 de oct.).** Esta revisión se hizo sobre una copia de la rama que estaba **atrás de producción**. Ya están corregidos en producción: el punto 1.1 (registro como `super_admin`: migración 073), el punto 1.4 (`POST /api/barberos` exige sesión) y toda la cadena de `/api/barberos` (`[id]`, `role`, `avatar`, `resend-credentials`), commit `d01bef1`, y el `Suspense` de `suscripcion/resultado`. El resto de los puntos sigue vigente hasta confirmarlo contra producción.

Revisión de solo lectura de la rama `claude/hopeful-mayer-jtqlh4` (296 archivos, unas 43.000 líneas), hecha por 5 revisores en paralelo: seguridad, suscripciones, agenda y reservas, POS y finanzas, interfaz e infraestructura.

**Cómo leerlo.** Es una lectura del código, no una prueba en vivo: no se ejecutó la app, ni `tsc`, ni `npm audit`, ni `next build`. Los 4 hallazgos más graves de la sección 1 los comprobé yo mismo en el código. El resto sale de los informes de los revisores y las líneas son aproximadas. Antes de tocar producción hay que confirmar cada punto en `rebooking-pruebas`.

---

## 1. Lo urgente: hoy cualquiera puede tomar control de un negocio

Verificado en el código:

| # | Qué pasa | Dónde |
|---|----------|-------|
| 1 | **Cualquiera puede registrarse como `super_admin`.** El registro es abierto y el trigger `handle_new_user` toma el rol de `raw_user_meta_data->>'role'`, que manda el propio usuario. | `supabase/migrations/051_fix_user_role_enum_and_trigger.sql:17-30`, `src/app/registro/page.tsx` |
| 2 | **Un usuario con sesión puede cambiarse su propio rol y negocio.** `profiles_update_own` no tiene `WITH CHECK` ni limita columnas. | `001_initial_schema.sql:213` |
| 3 | **La base de datos no aísla negocios.** 47 políticas `USING (true)` dejan que cualquier usuario con sesión lea y edite datos de todos los negocios saltándose la API, incluidos los tokens de Mercado Pago y TUU, los PIN y `temp_password`. | migraciones 001 a 057 |
| 4 | **`POST /api/barberos` no pide sesión.** Crea usuarios ya confirmados con el rol que pidan (incluido `super_admin`) en cualquier negocio. | `src/app/api/barberos/route.ts:68` |
| 5 | **`/api/audit` no pide sesión.** Lista el log de todos los negocios y permite falsificar o "revertir" entradas. | `src/app/api/audit/route.ts` |

Reportado por los revisores, sin comprobar por mi cuenta:
- `POST /api/barberos/resend-credentials` cambia la contraseña de cualquier cuenta sin sesión.
- La cadena de PIN: `GET/PATCH/DELETE /api/barberos/[id]` sin sesión y `PATCH .../role` con un PIN de 4 dígitos sin límite de intentos.
- `settings/mercadopago` y `settings/tuu` (y sus terminales) permiten poner tu token de cobro en el negocio de otro.
- `/api/auth/log-session` (GET) lista sesiones de todos, con IP y correo.
- `/api/business-hours` (PATCH) edita horarios de cualquier negocio sin sesión.
- `permissions.ts` tiene el comodín `"/dashboard"` para admin y recepción, así que pueden abrir `/dashboard/superadmin/*` por URL.
- Next 14.1.3 tiene vulnerabilidades públicas, entre ellas el salto del middleware (CVE-2025-29927).

**Orden recomendado para esto:**
1. **Migración SQL (la aplica Pablo).** Que el trigger ignore el rol de `user_metadata` y cierre `profiles_update_own`. Después, reemplazar los `USING (true)` por filtro de `tenant_id`, empezando por `tenants`, `tenant_settings`, `subscriptions`, `mp_*`, `tuu_*`, `invite_codes` y `profiles` (PIN y tokens). Probar primero en `rebooking-pruebas`.
2. **Una sola función de seguridad para las rutas.** Un helper tipo `requireTenantSession({ role })` y usarlo en las ~49 rutas "a revisar". Orden: barberos y role, settings de pagos, audit y log-session, business-hours, pos/checkout, caja/reopen, comisiones y arriendo, wallet, loyalty, tuu y mercadopago.
3. **PIN.** Un helper `verifyAdminPin(tenantId, pin)`: filtra por negocio, guarda el PIN con hash, limita intentos y no acepta el "1234" por defecto de `ADMIN_PIN`.
4. **Actualizar Next** a 14.2.x y revisar `xlsx` 0.18.5.
5. Antes de cada cambio de ruta, confirmar qué pantallas la llaman: algunas se llaman de servidor a servidor, sin cookies.

---

## 2. Dinero: suscripciones, cobros y caja

### Suscripciones (Mercado Pago)
**Está bien:** el monto lo calcula el servidor; firma del webhook con HMAC y reconsulta a MP; idempotencia por `mp_payment_id`; gracia de 2 días; bloqueo real de suspendidos (panel, API 402 y reservas públicas); renovación anual con recordatorios.

**Falta:**
- **La cancelación nunca corta el acceso.** Un negocio que cancela queda activo para siempre. Nada hace cumplir `current_period_end`.
- **El trial nunca vence.** `trial_ends_at` solo muestra un banner. Esto explica el pendiente de las fechas "Expira": ese campo es solo informativo.
- **`/api/auth/signup-business` es público.** Crea negocios en trial sin pago, captcha ni límite.
- **La firma del webhook falla abierta** si falta `MP_WEBHOOK_SECRET`, y los crons quedan abiertos si falta `CRON_SECRET`.
- Posible alta anual duplicada o rota por un evento `payment` de una suscripción mensual (confirmar en sandbox).
- Si el alta falla después de pagar, nadie se entera: queda `pending`, MP no reintenta y no hay conciliación.
- Dos pestañas o pagos con el mismo email pueden cobrar dos veces. La búsqueda de email usa `ilike` (los `_` y `%` son comodines).
- Los crons de `vercel.json` son horarios, pero el plan Hobby solo permite uno al día.
- El cambio de plan mensual no prorratea, no valida profesionales al bajar y no actualiza `max_branches`.
- El superadmin cambia plan y estado sin sincronizar `subscriptions`; no hay precio por empresa.
- Precios y IVA: la lógica está copiada en `/suscribirse` y en la landing; no hay redondeo comercial (de ahí $66.628); la landing dice "+ IVA" y `/suscribirse` muestra "desde $X" sin IVA.
- El error "Payer is associated with a different site" sale crudo, sin mensaje claro.
- No hay boleta/factura de la propia suscripción (hablar con el contador).

**Orden:** (1) cargar y regenerar `MP_WEBHOOK_SECRET` y `CRON_SECRET`, y hacer que fallen cerrado; (2) cerrar o proteger `signup-business` y decidir si existe el trial; (3) un helper `effectiveAccess()` que bloquee por cancelada vencida, trial vencido y periodo vencido; (4) crons compatibles con Hobby o un scheduler externo; (5) guarda `billing_period==='annual'` en el pago único; (6) alta robusta y conciliación; (7) precios en un solo lugar, con IVA siempre visible; (8) mensaje claro para el error de Chile; (9) cambios de plan y precio por empresa.

### POS, caja y finanzas
**Está bien:** el cobro completa la cita; la cuadratura de caja con pagos mixtos; zona horaria de Chile en reportes; apertura de caja única por día; el flujo de tarjeta distingue aprobado, rechazado y "sin confirmar"; el movimiento manual de caja con PIN y auditoría; la anulación suave; la propina separada del total.

**Falta:**
- **`pos/checkout` confía en el navegador:** totales, descuento, cupón y stock. No pide sesión ni caja abierta, y no comprueba que el pago con tarjeta esté aprobado.
- **El cobro no es atómico ni idempotente.** Son ~10 escrituras sueltas; un reintento o doble clic duplica la venta. Si falla el registro con la tarjeta ya cobrada, el POS no avisa y la venta se pierde en silencio.
- **Stock con carrera,** que permite stock negativo.
- **PIN de admin sin filtro por negocio** (`pos/verify-pin`, `comisiones/adjust`, `arriendo/adjust`): sirve el PIN de otro negocio y falla si dos admins comparten PIN. `caja/reopen` no pide PIN en el servidor ni deja rastro.
- **Comisiones:** `Number(rate) || 40` convierte un 0% en 40%; los ajustes manuales se guardan sin `tenant_id`; "pagar" marca todo el mes sin parciales, sin egreso en finanzas y sin auditoría.
- **Arriendo:** al marcar pagado sin registro previo queda en `days_worked = 0`, es decir, en $0; tarifa de $29.000 y 10% fijos en el código.
- **Cupones y fidelidad:** el código de cupón es global (dos negocios no pueden usar "VERANO10"); 1 punto = $100 fijo; los puntos no se revierten al anular.
- **Anular o editar una venta** no deja auditoría, no devuelve stock ni puntos, y se puede hacer con la caja ya cerrada.
- **Multi-sucursal sin integrar:** ningún endpoint de finanzas escribe ni filtra `branch_id`.
- **Cierre mensual:** la utilidad queda sobreestimada (no resta comisiones pagadas ni suma el arriendo cobrado).
- **SII/boleta electrónica no funciona de verdad** (solo arma un JSON hacia un proveedor sin datos del emisor, folios ni IVA). La pantalla Boletas envía un comprobante por correo, no un documento tributario. Las facturas se suben a un bucket público.
- **Sin exportación a Excel/CSV** de ventas, caja, comisiones ni cierre.
- TUU y MP: sin webhook (si se cierra el navegador se pierde la venta); el fallback a `MP_ACCESS_TOKEN` global podría cobrar a la cuenta de la plataforma.

**Orden:** (1) sesión, negocio y rol en las rutas de dinero; (2) `verifyAdminPin`; (3) checkout transaccional (función SQL) con idempotencia, precios calculados en el servidor y botón "reintentar registro"; (4) auditoría y reversa al anular; (5) comisiones y arriendo correctos; (6) fidelidad y cupones por negocio; (7) multi-sucursal; (8) cierre mensual real; (9) exportaciones; (10) decidir con Pablo si se integra un proveedor de boleta electrónica o se etiqueta como "comprobante".

---

## 3. Agenda y reservas

**Está bien:** la disponibilidad pública (día de la semana, bloqueos, almuerzo, hora de Chile); los precios y duraciones salen de la BD al reservar; la etiqueta NUEVO; el calendario móvil con Tarjetas y Grilla; la vista agrupada semanal con su guarda de servidor; las cuotas de mensajes en recordatorios y retención; el mensaje de WhatsApp con el nombre del negocio dinámico.

**Falta:**
- **La reserva pública no revisa el horario en el servidor** (bloqueos, días libres, pasado, anticipación). Un POST manual puede reservar a las 3 am o sobre un bloqueo. Tampoco filtra los servicios por el negocio del profesional.
- **Doble reserva posible** por carrera: no hay restricción de exclusión en `appointments`.
- **El portal de clientes expone datos personales:** `client-lookup` entrega nombre, correo y teléfono de cualquier cliente, y `portal/data` no verifica nada. El código de acceso es de 4 dígitos con `Math.random` y sin límite de intentos.
- **Rutas de agenda sin sesión:** `PATCH /api/appointments/[id]`, `POST /api/appointments`, `.../details`, `barber/blocks`, `push/send` y `push/subscribe`. En la lista de espera falta `tenant_id` y se filtran las esperas entre negocios.
- **Sin anti-spam** en reserva pública, lista de espera, portal ni reseñas: se puede vaciar la cuota de mensajes con reservas falsas.
- Teléfono sin validar y clientes duplicados cuando se reserva sin email (cada reserva crea un cliente "Nuevo").
- **Zona horaria:** la hora de Chile se guarda "como UTC". Eso desplaza 3 a 4 horas la ventana de recordatorios y la regla de cancelar con 2 horas.
- Recordatorios: la cita se marca como enviada aunque el correo falle, y `cron/post-service` no tiene autenticación ni cuota.
- **Datos de otro negocio fijos en mensajes:** el teléfono "9 4266 6172" en WhatsApp y en el correo de confirmación, y el dominio viejo `barberia-kappa-weld.vercel.app` en varios archivos.
- Mi Agenda crea citas por la ruta pública (las marca `source: "link"`) y no muestra NUEVO; varios fallos de red se ven como éxito.
- SEO: todas las páginas públicas comparten el mismo título, no hay `generateMetadata`, `sitemap` ni `robots`; hay problemas de accesibilidad.
- Cuotas de mensajes: el control no es atómico y se descuenta antes de enviar. La retención sin paginar queda incompleta con más de 1.000 clientes.

**Orden:** (1) cerrar las rutas de agenda, push y lista de espera; (2) arreglar el portal; (3) revalidar el horario en `public/book` con la misma lógica de disponibilidad; (4) restricción de exclusión en BD contra la doble reserva; (5) límite de uso y validación de teléfono; (6) zona horaria y regla de cancelación configurable; (7) mensajes y cuotas sin datos fijos de un negocio; (8) paginar retención; (9) SEO y accesibilidad (aquí encaja el pixel de Meta).

---

## 4. Interfaz, superadmin e infraestructura

**Está bien:** el layout valida la sesión en servidor; las rutas de superadmin tienen guarda de rol; el borrado de empresa exige escribir el nombre y es transaccional; el tema por usuario y por negocio, con la precedencia correcta y tolerante a que falte la migración; **el logo en oscuro ya está resuelto en el sidebar** (los pares `dark:hidden`/`hidden dark:block` y los PNG blancos son realmente blancos); las migraciones 073 a 087 son re-ejecutables; la landing tiene los precios que coinciden con la BD.

**Falta:**
- **Flechas del dashboard:** `Delta` pinta un 0% en verde con flecha ▲, también para las cancelaciones (esa es la causa más probable del "cancelaciones en verde"). Hay que tratar el 0 como neutro.
- **Gráfico de ventas:** barras con baja opacidad y etiquetas de 9 px, con poco contraste. El botón de rango activo en oscuro también.
- El superadmin sin negocio no guarda su tema; el tema se aplica tarde y se ve un parpadeo claro al cargar.
- No hay `error.tsx`, `not-found.tsx` ni `global-error.tsx`; varias pantallas no revisan `res.ok` y caen al ErrorBoundary.
- **Sin pruebas, CI, ESLint configurado ni monitoreo.**
- `next.config.js` vacío: sin cabeceras de seguridad.
- Dependencias sin uso (unas 20: casi todo Radix, `zod`, `recharts`, `framer-motion`, etc.) y `.env.example` desalineado con el código (faltan `MP_ACCESS_TOKEN`, `ADMIN_PIN`, `VAPID_EMAIL`, `SII_*`).
- **Los seeds** `seed_presentacion.sql` y `seed_realistic.sql` borran datos de todos los negocios sin guarda. Peligroso si se pegan en producción.
- Migraciones: faltan los números 002 y 029; la 030 borra `plan_limits` si se re-ejecuta; hay dos archivos "combinados" que pueden divergir y ninguno incluye 086/087. Además, `herramientas/migraciones_produccion_073_085.sql` dice que producción no tenía algunas de esas tablas, lo que contradice el "073 a 085 aplicadas". Hay que confirmar con Pablo el estado real.
- Landing sin `<title>`, descripción ni Open Graph; `entrega/` es una copia desactualizada.
- Command palette sin filtro por rol ni teclado; `pagos/page.tsx`, `activity-indicator` y `api-fetch` son código muerto; `maximum-scale=1` bloquea el zoom.

**Orden:** (1) arreglar el comodín de `permissions.ts` y cerrar audit, log-session y business-hours; (2) flechas y gráfico del dashboard (pendiente #15) y tema del superadmin; (3) páginas de error y manejo de `res.ok`; (4) ESLint, scripts `typecheck`/`test` y un workflow de CI con pruebas de `subscription-pricing`, `permissions` y fechas de Chile; (5) cabeceras de seguridad y limpieza de dependencias y variables; (6) proteger los seeds y ordenar las migraciones; (7) landing: título, SEO y una sola fuente.

---

## 5. Cómo encajan tus pendientes anteriores

| Pendiente de CONTEXTO.md | Estado según la revisión |
|---|---|
| Redondeo de precios (#6) | Confirmado: solo redondea a pesos enteros. Falta decidir la regla y aplicarla en un solo lugar. |
| Precio por empresa (#8) | Confirmado: no existe columna ni campo en el modal. |
| IVA inconsistente (#7) | Confirmado, en la landing y en `/suscribirse`. |
| Logo en oscuro (#14) | **Ya resuelto** en el sidebar. Falta revisarlo a ojo en la pantalla. |
| Flechas en verde (#15) | Causa encontrada: `Delta` pinta 0 en verde. |
| Fechas "Expira" (#10) | Es `trial_ends_at`, solo informativo. Ocultar si el estado no es trial, y hacer cumplir el vencimiento. |
| Build de Vercel (#5) | Sin cambios: falta el `Suspense`. |
| Tema por profesional (#13) | Hecho. Falta la estadística en el superadmin y definir si incluye colores de marca. |
| Pixel de Meta (#17) | Sin implementar; encaja con el SEO de páginas públicas. |

---

## 6. Plan sugerido por fases

| Fase | Contenido | Quién |
|---|---|---|
| **0 (hoy)** | Migración de roles y `profiles`; cerrar `POST /api/barberos`, `resend-credentials`, `barberos/[id]`, `role`, `audit`, `log-session`, `business-hours` y `settings/*` de pagos. Regenerar y cargar `MP_WEBHOOK_SECRET`, `CRON_SECRET` y el token expuesto. | Claude escribe parches y SQL; Pablo aplica |
| **1 (esta semana)** | Rutas de dinero, `verifyAdminPin` con rate limit, checkout seguro, webhooks con firma. Cancelación y trial que cortan el acceso. Actualizar Next. | igual |
| **2** | RLS por `tenant_id` real; cifrar o hashear PIN y tokens; reserva pública con validación y exclusión en BD; portal de clientes. | igual |
| **3** | Precios e IVA en un solo lugar, precio por empresa, multi-sucursal, cierre mensual, exportaciones, boleta electrónica. | igual |
| **4** | Dashboard, SEO, pixel de Meta, CI y pruebas, limpieza. | igual |

Cada entrega a Pablo sigue las reglas: commits pequeños, `tsc` antes de commitear, SQL re-ejecutable con consulta de verificación, y zip con parche, SQL y `LEEME.txt`.
