# Auditoría de rutas API que usan `createAdminSupabase()`

> **Actualización del 2 de oct. 2026 (contrastado con producción, `pdencina/barberia`, rama `main`).**
> El informe original se hizo sobre una copia desactualizada. Al compararlo con producción:
> - **Ya corregido por Pablo** (commit `d01bef1`, 26-sep): `barberos` (GET/PATCH/DELETE, `[id]`, `role`, `avatar`, `resend-credentials` y crear), que ahora exigen sesión de admin del mismo negocio (`authorizeBarberManagement`), más la migración 073 (el registro ya no toma el rol desde los metadatos). Por eso **la "cadena de riesgo principal" de más abajo ya no aplica**; se deja como registro.
> - **Siguen sin cambios en producción** (no hay commits de Pablo que las toquen): `pos/checkout`, `pos/checkout/tip`, `pos/verify-pin`, `caja/reopen`, `comisiones/adjust`, `arriendo/adjust`, `wallet`, `loyalty/earn` y `redeem`, `mercadopago*`, `tuu*`, `audit`, `invite-codes/verify`, `boletas/*`, `appointments/[id]*`, `clients/[id]*`, `services/*`, `products/[id]`, `cupones/[id]`, `barber-*`, `gallery*`, `waitlist*`, `push/*`, `finanzas/[id]`, entre otras. Esas siguen a revisar.
> - Nota sobre `GET /api/barberos/[id]`: ahora exige sesión, pero sigue devolviendo el perfil completo (`select *`), incluido el PIN, a admin, recepción y al propio profesional. Conviene limitar las columnas.
> - Conteo actualizado (149 rutas con la llave de servicio): (a) 30, (b) 74, (c) 45. Las cuatro rutas de `barberos` pasaron de (c) a (b).
> - `suscripcion/resultado` ya está corregido en producción (commit `ef85865`).

Informe de **solo lectura**: no se modificó ninguna ruta. Revisadas las 148 rutas de `src/app/api` que usan la llave de servicio (esa llave se salta las reglas de acceso de Supabase, así que la protección tiene que estar en cada ruta).

## Cómo leer este informe

- **(a) Pública a propósito**: reservas, disponibilidad, cron, webhooks, registro y pago de suscripción. No se tocan. Solo anoto observaciones.
- **(b) Ya valida sesión y negocio**: usa `resolveTenantForRequest`, `getCurrentUserRoleAndTenant`, `isManagerLevel`, `canAccessBarber` o es de super admin.
- **(c) A revisar**: no valida sesión, o la valida pero no comprueba que el dato sea del negocio de quien llama.

Importante: el `middleware.ts` **no exige sesión** en `/api/*`. Solo bloquea negocios suspendidos. Por eso una ruta sin validación propia queda abierta a cualquier persona de internet que conozca la URL.

| Categoría | Rutas |
|---|---|
| (a) Pública a propósito | 30 |
| (b) Ya valida sesión y negocio | 74 (69 + 4 de `barberos` ya corregidas + `settings/calendar-view`) |
| (c) A revisar | 45 (eran 49) |

Limitaciones: las rutas de (c) las revisé leyendo el código, no ejecutándolas. En (b) comprobé que validan sesión y negocio, pero **no auditamos línea por línea** que cada consulta filtre por negocio (hice un muestreo, ver sección (b)). `webhooks/deposit` (255 líneas) solo lo revisé en su inicio.

---

## Cadena de riesgo principal — YA CORREGIDA EN PRODUCCIÓN (se deja como registro)

Estos cuatro hallazgos se combinan y permiten **tomar el control de un negocio sin tener cuenta**:

1. `GET /api/public/barbers` (pública, correcta) entrega los `id` de los profesionales.
2. `PATCH /api/barberos/[id]` no pide sesión y acepta `personal_pin`, `email`, `commission_rate`, `active`.
3. Con ese PIN, `PATCH /api/barberos/[id]/role` (sin sesión) cambia el rol de cualquier usuario, incluido `super_admin`.
4. Además `GET /api/barberos/[id]` devuelve el perfil completo (`select *`), que incluye `personal_pin` y `mp_access_token`.

Pablo la corrigió en el commit `d01bef1`. Verificado contra `main` de producción el 2 de oct.

---

## (c) Rutas a revisar

Fix general para casi todas: validar sesión con `resolveTenantForRequest` / `getCurrentUserRoleAndTenant`, comprobar que el registro pertenece al negocio de quien llama, y en acciones de plata exigir rol admin o recepción. Donde se usa PIN: exigir sesión **y** filtrar el PIN por negocio (como ya hace bien `barber/verify-pin`).

### Prioridad 1: plata y cuentas (CRÍTICO)

| Ruta | Qué queda expuesto hoy | Arreglo propuesto |
|---|---|---|
| ~~`barberos/[id]` (GET, PATCH, DELETE)~~ **CORREGIDO** (queda: limitar columnas del GET) | GET devuelve `select *`: **PIN personal y token de MercadoPago** de cualquier profesional. PATCH cambia PIN, email, comisión y activo sin sesión. DELETE borra. | Sesión + `canAccessBarber`. PATCH/DELETE solo admin. GET con lista explícita de columnas, sin PIN ni token. |
| ~~`barberos/[id]/role` (PATCH)~~ **CORREGIDO** | Cambia el rol de cualquier usuario (incluso a `super_admin`) conociendo un PIN de admin de **cualquier negocio**. PIN de 4 dígitos = 10.000 combinaciones, sin límite de intentos. | Exigir sesión de admin del mismo negocio; solo un super admin puede asignar `super_admin`; comprobar que el usuario objetivo es del negocio. |
| `pos/checkout` (POST) | Crea ventas en cualquier negocio (lo decide el `barberId`), descuenta stock, suma puntos y usa cupones. **Confía en `total`, `subtotal` y `descuento` que manda el navegador.** | Sesión; que `barberId` y `clientId` sean del negocio; recalcular el total en el servidor desde los precios reales; validar que el cupón sea del negocio. |
| `caja/reopen` (POST) | Sin sesión ni negocio: reabre "la caja cerrada de hoy" de cualquier negocio (la consulta no filtra por negocio ni sucursal). | Sesión de admin + filtrar por negocio/sucursal + PIN de ese negocio. |
| `comisiones/adjust` (POST, DELETE) | Con **un PIN de admin de cualquier negocio** se crean ajustes de plata a cualquier `barberId` y se **anulan transacciones** por id. Si dos admins comparten PIN, `.single()` falla. | Sesión admin + PIN filtrado por negocio + verificar que `barberId`/`transactionId` son del negocio. |
| `arriendo/adjust` (POST) | Igual que el anterior: modifica `rental_records` de cualquier profesional. | Igual. |
| `pos/checkout/tip` (PATCH) | Cambia la propina de cualquier transacción por id, sin sesión. | Sesión + transacción del negocio. |
| `pos/verify-pin` (POST) | Sirve para **adivinar PINs de admin** sin sesión, sin negocio y sin límite de intentos. | Sesión + filtrar por negocio + límite de intentos (patrón de `barber/verify-pin`). |
| `wallet` (GET) | Ganancias, ventas y comisiones de cualquier profesional con solo `?barberId=`. | `canAccessBarber(barberId)`; si el rol es barber, solo el suyo. |
| `loyalty/earn` (POST) | Suma puntos a cualquier cliente con un monto inventado. | Sesión + cliente del negocio. Idealmente calcular los puntos desde la transacción real, no desde `amount`. |
| `loyalty/redeem` (POST) | Canjea puntos y **genera un cupón de descuento** para cualquier cliente. Junto con `earn` permite fabricar descuentos ilimitados. | Sesión + cliente del negocio. |
| `mercadopago` (GET, POST) | POST inicia un cobro en la terminal de cualquier profesional (con el token del negocio) y con monto arbitrario. | Sesión + `canAccessBarber(barberId)`. |
| `mercadopago/cancel` (POST) | Cancela cualquier orden usando el **token de la plataforma**, solo con el `orderId`. | Sesión + comprobar que la orden pertenece al negocio. |
| `mercadopago/status` (GET) | Consulta órdenes de MP sin sesión (usa el token del negocio o el de la plataforma). | Sesión + `canAccessBarber`. |
| `tuu` (POST), `tuu/status` (GET) | Igual que MercadoPago: inicia/consulta cobros en la terminal TUU de cualquier profesional. | Sesión + `canAccessBarber`. |
| `tuu/cancel` (POST) | Con `cancelAll` **sin `barberId` cancela los cobros pendientes de TODOS los negocios**. | Sesión; siempre filtrar por el negocio de la sesión. |
| `finanzas/[id]` (PATCH, DELETE) | Exige rol admin, pero **no comprueba que el movimiento sea de su negocio**: un admin de otro negocio puede editar o anular movimientos ajenos. | Filtrar por `tenant_id` de la sesión en el `update`/`delete`. |

### Prioridad 2: datos de clientes y operación (ALTO)

| Ruta | Qué queda expuesto hoy | Arreglo propuesto |
|---|---|---|
| `clients/[id]` (GET) | Ficha completa (`select *`) y citas de cualquier cliente. | Sesión + cliente del negocio. |
| `clients/[id]/photos` (GET, POST, DELETE) | Ver, subir y borrar fotos de clientes de cualquier negocio. | Igual. Validar tipo y tamaño al subir. |
| `appointments/[id]` (PATCH) | Cambia estado, hora, profesional y servicios/precios de cualquier cita. | Sesión + cita del negocio. |
| `appointments/[id]/details` (GET) | Nombre, email, teléfono y puntos del cliente de cualquier cita. | Sesión + cita del negocio. |
| `boletas/emit` (POST) | Emite boleta electrónica (efecto tributario) de cualquier transacción. | Sesión admin/recepción + transacción del negocio. |
| `boletas/send` (POST) | Envía correos con el recibo a **cualquier email** desde la cuenta del negocio. | Igual; no permitir `email` libre sin sesión. |
| ~~`barberos/resend-credentials` (POST)~~ **CORREGIDO** | Genera una contraseña temporal nueva para cualquier cuenta indicada por `profileId` o `email`. | Sesión admin + profesional del mismo negocio. |
| `invite-codes/verify` (POST) | Con un código válido se puede mover **cualquier `userId`** a un negocio y dejarlo como barber (incluso sacar a un admin de su negocio). | Exigir que `userId` sea el de la sesión actual. |
| `audit` (GET, POST) | GET lista el registro de auditoría de **todos los negocios**. POST permite escribir entradas falsas con cualquier usuario. | Sesión admin + filtrar por negocio; POST solo desde el servidor. |
| `push/send` (POST) | Envía notificaciones push a cualquier usuario o a todos los roles de **cualquier negocio** (el `tenantId` viene del cuerpo): sirve para phishing. | Sesión; o hacerla función interna del servidor. |
| `push/subscribe` (POST) | Registra suscripciones para cualquier `userId`. | Usar el `userId` de la sesión. |
| `services/[id]` (PATCH, DELETE), `services/reorder`, `services/[id]/photo` | Cambiar precios, borrar y reordenar servicios de cualquier negocio. | Sesión admin + servicio del negocio. |
| `products/[id]` (PATCH), `cupones/[id]` (PATCH, DELETE) | Cambiar precios de productos y editar/borrar cupones de cualquier negocio. | Igual. |
| `barber-services`, `barber-service-assignments`, `barber/blocks` | Leer y escribir precios personalizados, servicios asignados y bloqueos de agenda de cualquier profesional. | `canAccessBarber(barberId)` (ya existe y se usa en `barber/agenda`). |
| `gallery` (GET, POST, DELETE), `gallery/upload`, `barberos/[id]/avatar` | Subir/borrar imágenes a nombre de cualquier profesional; la subida no valida tipo ni tamaño. | `canAccessBarber` + validar imagen y tamaño. |
| `waitlist` (GET, PATCH), `waitlist/notify` | Lista de espera (nombres y teléfonos) de todos los negocios. | Sesión + filtrar por negocio. `waitlist` público de clientes (POST en `public/waitlist`) no cambia. |

### Prioridad 3: riesgo bajo o de diseño

| Ruta | Observación | Arreglo propuesto |
|---|---|---|
| `portal/data` (GET) | Entrega datos de un cliente con solo `?clientId=` (UUID). `portal/auth` verifica el código pero esta ruta no comprueba que se haya verificado. Es del portal público: **no tocar sin decidir el diseño** (por ejemplo, un token firmado). | Que `portal/auth` entregue un token firmado y `portal/data` lo exija. |
| `cupones/validate` (GET) | Cualquiera puede probar códigos de cupón de cualquier negocio. | Filtrar por negocio; límite de intentos. |
| `notifications/client-arrived` (POST) | Dispara una notificación push a un profesional con solo `appointmentId`. | Sesión. |
| `price-history` (GET) | Historial de precios de todos los negocios. | Sesión + filtrar por negocio. |
| `auth/clear-temp-password` (POST) | Cualquiera puede borrar la contraseña temporal y la marca de cambio obligatorio de un negocio, conociendo el email del administrador. | Exigir sesión y usar el email de la sesión. |
| `auth/check-tenant` (GET) | Confirma si un email es administrador de un negocio y devuelve id y slug. | Devolver solo lo mínimo para el login. |
| `auth/log-session` (POST) | Permite insertar inicios de sesión falsos de cualquier usuario. | Usar el usuario de la sesión. |

---

## (b) Ya valida sesión y negocio (69 rutas)

`analytics/products`, `appointments`, `appointments/week`, `arriendo`, `auth/complete-onboarding`, `barber-schedule`, `barber/agenda`, `barber/verify-pin`, `barberos`, `billing/*` (6), `booking-metrics`, `branches`, `branches/[id]`, `business-hours`, `caja`, `caja/[id]`, `caja/manual-movement`, `clientes/metricas`, `clients`, `clients/[id]/documents`, `clients/[id]/notes`, `clients/bulk-delete`, `clients/export`, `clients/import`, `comisiones`, `cron/reminders/whatsapp`, `cupones`, `dashboard`, `finanzas`, `inventario/movements`, `invite-codes`, `invoices`, `loyalty`, `loyalty/rewards`, `mercadopago/terminals`, `message-quota/request`, `onboarding`, `products`, `profile/theme`, `reportes/*` (3), `retention`, `retention/bulk`, `retention/notify`, `services`, `settings/*` (12), `superadmin/*` (4), `team/birthdays`, `tenant/info`, `whatsapp/contacts`.

Qué comprobé: todas las rutas que usan `resolveTenantForRequest` revisan el resultado (`denied` o tenant nulo). Los `[id]` que muestreé (`branches/[id]`, `caja/[id]`, `clients/[id]/notes`, `clients/[id]/documents`, `clients/bulk-delete`, `caja/manual-movement`) filtran por negocio.

Observación (riesgo MEDIO, no es fuga entre negocios): estas rutas validan sesión y negocio, **pero no el rol**. Un profesional (rol barber) logueado podría llamarlas directamente aunque la pantalla se las oculte: `comisiones`, `arriendo`, `caja`, `finanzas`, `inventario/movements`, `invoices`, `retention/bulk`, `settings/business`, `settings/mercadopago`, `settings/tuu`, `invite-codes`, `barberos`, `branches`. Arreglo propuesto: usar `isManagerLevel()` en las acciones de escritura y de datos de todo el negocio. `finanzas/[id]` y `dashboard` ya lo hacen bien.

---

## (a) Públicas a propósito (30 rutas), sin cambios

- **Reservas y consulta pública (16):** `public/availability`, `barber-days`, `barber-services`, `barber`, `barbers`, `book`, `business-info`, `cancel`, `client-lookup`, `confirm-attendance`, `first-available`, `reviews`, `services`, `slots-by-time`, `tenant-booking`, `waitlist`.
- **Cron (4):** `cron/annual-renewals`, `cron/reminders`, `cron/suspend-past-due` (usan `CRON_SECRET`) y `cron/post-service`.
- **Webhooks (3):** `webhooks/deposit`, `payments/webhook`, `checkout/subscribe/webhook`.
- **Pago y suscripción (3):** `booking/create-deposit`, `checkout/subscribe`, `checkout/subscribe/status`.
- **Cuenta (4):** `plans`, `auth/forgot-password`, `auth/signup-business`, `portal/auth`.

Observaciones (no se tocó nada):

- `public/barbers` entrega los `id` de los profesionales. Está bien para reservar, pero es el primer eslabón de la cadena de riesgo de arriba: por eso las rutas que reciben ese `id` tienen que validar sesión.
- `cron/post-service` **no tiene `CRON_SECRET`**: cualquiera puede dispararlo y mandar los correos de agradecimiento (se suelen proteger como las otras tres). `cron/annual-renewals` y `cron/suspend-past-due` solo exigen el secreto si la variable existe: si falta en producción, quedan abiertas.
- `payments/webhook` no valida la firma de MercadoPago y no usa una llave única por pago: un aviso repetido puede crear la transacción dos veces. Consulta el pago real a MP, así que no se puede inventar un pago aprobado.
- `webhooks/deposit` no verifica firma en las primeras líneas; falta revisarlo completo.

---

## Orden de arreglo sugerido (cada paso, un commit pequeño)

1. ~~Cadena de riesgo `barberos`~~ (ya corregida). Queda `invite-codes/verify` y limitar columnas del `GET barberos/[id]`.
2. PIN de plata: `comisiones/adjust`, `arriendo/adjust`, `pos/verify-pin`, `caja/reopen`.
3. `pos/checkout` (recalcular total en el servidor) + `loyalty/earn` y `loyalty/redeem`.
4. Cobros: `mercadopago*`, `tuu*` (empezar por `tuu/cancel` con `cancelAll`).
5. Datos de clientes: `clients/[id]*`, `appointments/[id]*`, `wallet`, `audit`, `boletas/*`, `finanzas/[id]`.
6. Catálogo y agenda: `services*`, `products/[id]`, `cupones/[id]`, `barber-*`, `gallery*`, `waitlist*`, `push/*`.
7. Rol en las rutas de (b) y observaciones de (a) (por ejemplo, `CRON_SECRET` en `cron/post-service`).

Antes de empezar a arreglar: **confirmar qué páginas llaman a cada ruta**, porque algunas (por ejemplo `pos/checkout` desde el POS, `push/send` desde `notifications/client-arrived`) son llamadas servidor a servidor sin cookies y se romperían si solo se les exige sesión.
