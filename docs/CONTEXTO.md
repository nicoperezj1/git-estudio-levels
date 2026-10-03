# Contexto: re-booking (Estudio Levels)

Última actualización: 3 de octubre de 2026. Léelo al empezar una sesión nueva. Reemplaza a los dos contextos anteriores (cobros y suscripciones, y calendario/POS/seguridad).

> **Producción es la referencia, no esta copia.** El repo oficial es `pdencina/barberia`, rama `main` (público; se puede clonar solo para leer). Esta rama se actualiza trayendo ese `main` (`git fetch https://github.com/pdencina/barberia main` y merge). **Antes de cualquier tarea, comparar con producción**, porque Pablo también cambia código y esta copia puede quedar atrás. Revisado el 2 de oct. contra `main` (`f7931c2`): producción **ya incluye** los parches 0011 y 0012, la corrección de seguridad de `/api/barberos` (`d01bef1`, 26-sep), el arreglo de Suspense (`ef85865`) y la migración 073 (el registro ya no toma el rol de los metadatos). **No incluye aún** el parche 0013 (Nuevo = primera cita + el cobro completa la cita) ni la migración 088 ni los parches de seguridad de la carpeta `entregas/`.

## Proyecto
- re-booking.cl: software de gestión y reservas para barberías y salones. SaaS de agenda y punto de venta (POS). Next.js 14 (App Router) + TypeScript + Tailwind + Supabase, desplegado en Vercel. Código en `src/`, migraciones SQL en `supabase/migrations/`.
- Producción: https://www.re-booking.cl
- **Quién es quién:**
  - Nico (Nicolás, GitHub `nicoperezj1`) es el dueño de Estudio Levels. Trabaja en este repo (`nicoperezj1/git-estudio-levels`) y en su carpeta local `~/barberia`.
  - Pablo (GitHub `pdencina`) es el desarrollador. Controla el repo oficial `pdencina/barberia` (rama `mejoras/tema-caja-superadmin`), Vercel y el Supabase de producción. Aplica los parches, corre las migraciones SQL **a mano** en el SQL Editor de producción y despliega.
- **Rama de trabajo en este repo:** `claude/hopeful-mayer-jtqlh4`.
- **Cómo correr en local:** `cd ~/barberia && npm install && npm run dev` y abrir http://localhost:3000. Hay que estar dentro de la carpeta del proyecto; si no, `npm` no encuentra el `package.json`.

> **Plan vigente:** `docs/PLAN-OCTUBRE.md` (fases, decisiones tomadas con Nico y plan de vuelta atrás de cada una).

> **Dónde quedamos (3 de oct., noche):**
> - **Regla de oro de esta sesión: NO volver a preguntarle a Nico lo que ya está decidido.** Las decisiones están en `docs/PLAN-OCTUBRE.md` sección 1 y el orden de trabajo es el del plan (Fase 0 → 1 → 2...). Nico ya respondió muchas preguntas; si algo está en el plan, se hace, no se pregunta. Preguntar solo lo que de verdad no está escrito. Hablarle simple, corto, sin tecnicismos; avanzar programando, no explicando.
> - **Hecho en código (Fase 1), todo en la rama, con `tsc` limpio:**
>   - Métricas de clientes: lee todos los clientes por páginas (antes solo los primeros 1.000).
>   - Puntos de fidelidad al cobrar: usan la regla del negocio de la venta (`pos/checkout`).
>   - Cómo nos conoció: se sumaron "Facebook" y "Referido de un amigo/conocido" (Clientes, Métricas, PDF del cierre) y el selector aparece también al crear cliente desde el POS. Sin SQL.
>   - Mi Agenda: el admin que atiende clientes sale primero y seleccionado.
>   - Orden de servicios: el arrastrar ya existía; ahora la reserva "por hora" (`public/services`) respeta `sort_order`, y `/api/services/reorder` exige sesión y negocio.
> - **Fase 1 que FALTA** (seguir en este orden): nombre de encargado de recepción + ocultar campos que no le aplican; calendario en celular (un toque abre Agendar/Bloquear, "Atrás" y tocar fuera solo cierran, líneas de hora sutiles); calendario 7 días con varios profesionales permite agendar con clic; fidelidad configurable (puntos y recompensas por negocio; proteger `loyalty/earn` y `redeem`). Después **Fase 2 (finanzas)**.
> - **Fase 0 pendiente con Pablo:** parche `0013`, sitio de prueba en Vercel. Claves expuestas (`MP_WEBHOOK_SECRET`, token `APP_USR`) por regenerar: urgente y no necesita código.
> - Nico prueba en su computador (`localhost`). Aún **no tiene acceso de admin** a Supabase, Vercel ni al GitHub de Pablo: los cambios se le entregan como zip a Pablo.

## Entorno de pruebas (ya armado, no volver a preguntar)
- Base de pruebas: Supabase `rebooking-pruebas` (ref `ucwrdmwtlesayjxmlbve`). El `.env.local` de Nico ya apunta ahí. **Nunca** producción.
- Script `scripts/seed-pruebas.mjs` (no va en los zips a Pablo): se niega a correr si la URL no es la de pruebas. `--dry` simula; `--crear-negocio` crea el negocio si el admin no tiene. Re-ejecutable.
- Negocio de pruebas "Estudio Levels (pruebas)", id `0235d97a-6658-4a1c-be69-8c1341ac50ce`, plan **Pro**, 8 profesionales. Si la pantalla muestra "límite de profesionales (3)" o candados PRO, correr en el SQL Editor **de pruebas**: `update tenants set plan='pro', max_professionals=8 where id='0235d97a-6658-4a1c-be69-8c1341ac50ce';`
- Usuarios de prueba (clave de todos: `Prueba2026!`; el admin conserva su clave de siempre):
  - Admin `nicoperezj1@gmail.com` PIN 3333
  - Recepción David Muñoz `nicoperezj1+recepcion@gmail.com` PIN 1234
  - Arriendo $16.000/día, Matías Soto `nicoperezj1+arriendo@gmail.com` PIN 1111
  - Comisión 48%, Camila Rojas `nicoperezj1+comision48@gmail.com` PIN 2222
  - Comisión 40%: Diego Fuentes `nicoperezj1+diego@gmail.com` PIN 4444; Valentina Paredes `nicoperezj1+valentina@gmail.com` PIN 5555
  - 20 clientes `clienteNN@prueba.test` con orígenes variados y 20 citas (pasadas, hoy y próximas).
- Cómo trabaja Nico en su Mac (carpeta `~/barberia`): el servidor corre en **una ventana de Terminal** (`npm run dev`); los demás comandos van en **otra ventana/pestaña** (`Cmd+T`), nunca en la del servidor. Para traer lo nuevo: `git fetch https://github.com/nicoperezj1/git-estudio-levels claude/hopeful-mayer-jtqlh4` y `git checkout -B claude/hopeful-mayer-jtqlh4 FETCH_HEAD`. Si sale "Cannot find the middleware module": detener el servidor, `rm -rf .next`, volver a `npm run dev`. Pegar comandos largos a veces mete caracteres raros (`[200~`): escribirlos a mano o pegar de a una línea.
- El hook del repo pide hacer `git push` a la rama de trabajo al terminar; se hace (solo a `claude/hopeful-mayer-jtqlh4`).

## Reglas de trabajo
- Responder en español, informal, claro, directo y sin jerga.
- Cambios pequeños y revisables. Antes de cada commit: `npm ci` (una vez) y `npx tsc --noEmit`.
- No correr `next build` ni tareas pesadas sin avisar antes a Nico.
- Commits con `-c user.name=Claude -c user.email=noreply@anthropic.com`.
- **Git:** los cambios los integra Pablo. No hacer `git push` salvo que Nico lo pida; cuando lo pida, solo a la rama de trabajo. No crear PR salvo que lo pidan.
- Las migraciones deben ser aditivas y re-ejecutables (`IF NOT EXISTS`), entregadas como `.sql` listo para pegar, con consulta de verificación al final.
- Cada entrega a Pablo es un **zip** con: parche (`git diff`), SQL de producción y `LEEME.txt` con pasos y lista de pruebas. Antes de entregarlo, verificar que el parche aplica con `git apply --check` sobre la base correcta.
- No tocar `.env*` ni subir llaves. Nunca poner credenciales, tokens ni datos de tarjeta en el chat. Trabajar solo en sandbox/pruebas con pagos.
- Las rutas API usan `createAdminSupabase()`, que se salta las reglas de acceso de Supabase. Cada ruta debe validar sesión y negocio (`resolveTenantForRequest`, `getCurrentUserRoleAndTenant`, `canAccessBarber`, `isManagerLevel`).
- Pablo no da acceso admin al Supabase de producción (tiene datos de otros negocios). Producción es un proyecto dedicado a re-booking (45 tablas, 4 negocios, ~2.700 clientes). Supabase de pruebas: proyecto `rebooking-pruebas` (ref `ucwrdmwtlesayjxmlbve`).

## Variables de entorno de producción (Vercel)
`MP_PLATFORM_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` (https final), `RESEND_API_KEY`, `EMAIL_FROM`. **No** definir `MP_PUBLIC_URL` (es solo para el túnel en desarrollo).

## Ya hecho

### Cobros y suscripciones (desplegado en producción el 30 de septiembre)
- Mercado Pago: mensual = Preapproval (suscripción recurrente); anual = pago único (Checkout Pro) con 20% de descuento. Webhook en `/api/checkout/subscribe/webhook` (eventos: Pagos y Planes y suscripciones). Planes por cantidad de profesionales; bloqueo por mora (máx. 2 días de gracia). Detalle en `docs/pago-suscripciones.md`.
- Bloqueo de negocios suspendidos: panel (HTTP 402 en middleware) y reservas públicas (403 `tenant_suspended`).
- Migraciones 073 a 085 aplicadas en producción por Pablo y verificadas (idempotentes).
- Panel de superadmin, retención de clientes y mensajería, cumpleaños del equipo, mejoras de interfaz.
- Pablo trajo el código desde un bundle de git que le pasó Nico.

### Calendario, POS y agenda (commits en la rama de trabajo)
- **`80cee4e`** (primer parche, ya enviado a Pablo):
  - Calendario en celular con selector Tarjetas/Grilla; 1/3/7 días por profesional.
  - Tema claro/oscuro **por usuario** (Mi Perfil > Mi tema, columna `profiles.theme`, migración 086). El tema del negocio (`tenants.theme`) es el valor por defecto.
  - Precios sin múltiplos de $500 en los campos (`step="1"`).
- **`e054b8f`:** la propina del POS acepta cualquier monto.
- **`4c242cb`:** informe `docs/auditoria-rutas-api.md` (solo lectura).
- **`45a26c4`** (zip `cambios-1oct-vista-agrupada-whatsapp-agenda`):
  - Configuración > Calendario: casilla "Vista profesionales agrupados por semana". Solo para negocios de 2 a 4 profesionales (el servidor lo exige). Columna `tenants.calendar_group_week` (migración 087). Apagada por defecto.
  - Celular: abre en Grilla; "Tarjetas" es opcional y se recuerda en `localStorage`. Los bloqueos manuales se ven en Tarjetas y en las vistas de varios días.
  - Mi Agenda: botones WhatsApp y Ficha del cliente en cada cita.
  - Mensaje de WhatsApp compartido con el Calendario (`src/lib/whatsapp-confirm.ts`). El nombre del negocio sale del negocio del usuario logueado; nunca va fijo.
  - Recepción ahora ve "Mi Perfil". API nueva: `src/app/api/settings/calendar-view/route.ts`.
- **`4cf7be7`** (zip `cambios-1oct-nuevo-y-cobro-completa-cita`):
  - Etiqueta "NUEVO" = primera cita del cliente o cita sin ficha vinculada. Las citas canceladas o de "no se presentó" no cuentan como visita previa (`src/lib/new-client.ts`).
  - Al cobrar en el POS, la cita queda **Completada** (la del botón "Cobrar" del calendario vía `appointmentId`; si se cobra directo, la cita activa de hoy de ese cliente con ese profesional, solo si hay exactamente una).
- Los dos zips traen un parche incremental y uno acumulado desde `e386ee8`. Pablo usa **solo uno**, según lo que ya haya aplicado.
- Las migraciones 086 y 087 las corre Pablo a mano. Confirmar con él cuáles ya están aplicadas en producción.

## Pendientes

### Seguridad (urgente)
1. **Rutas API.** El informe `docs/auditoria-rutas-api.md` clasifica las 149 rutas con `createAdminSupabase()`: 30 públicas a propósito, 74 que validan, **45 a revisar**. La cadena de `/api/barberos` (crear usuarios, cambiar roles y PIN sin sesión) **ya la corrigió Pablo en producción** (`d01bef1`); queda limitar las columnas que devuelve `GET /api/barberos/[id]` (hoy incluye el PIN). Siguen abiertos, sin cambios en producción: `pos/checkout`, `comisiones/adjust`, `arriendo/adjust`, `caja/reopen`, `pos/verify-pin`, `wallet`, `loyalty/earn` y `redeem`, `mercadopago*`, `tuu*`. El informe trae un orden de arreglo en commits pequeños. **Antes de arreglar**, confirmar qué pantallas llaman a cada ruta: algunas se llaman de servidor a servidor, sin cookies.
2. **Claves expuestas.** Regenerar `MP_WEBHOOK_SECRET` (se expuso en una captura) y pasarla a Pablo por privado; falta que la cargue en Vercel. Regenerar también el token `APP_USR` expuesto. Cambiar las claves de la nota abierta en la captura de Nico si se compartió.
3. Next 14.1.3 tiene una advertencia de seguridad; actualizar después de la auditoría.
4. Menores: RLS en 3 archivos del dashboard que usan Supabase desde el navegador; ocultar profesionales de negocios suspendidos en listados públicos.

### Build y cobros
5. ~~Build de Vercel (`suscripcion/resultado` sin `Suspense`)~~: ya corregido en producción (`ef85865`).
6. **Precio con múltiplos de 500:** los totales de suscripción salen como $66.628 o $365.453 (precio + adicional por profesional + IVA 19%). Redondear en un solo lugar, igual a lo que se cobra en Mercado Pago.
7. **Inconsistencia de IVA:** la landing dice "+ IVA"; `/suscribirse` muestra "desde $X" sin IVA y recién abajo "IVA incluido".
8. **Precio personalizado por empresa:** el modal "Editar" del superadmin no tiene campo de precio.
9. Error "Payer is associated with a different site (status 400)" al pagar con un email que no es de una cuenta de Mercado Pago de Chile.
10. Fechas "Expira" ya vencidas en negocios activos (Looky Estudio, Estudio Levels): confirmar que el bloqueo depende de la suscripción y no de esa fecha.
11. Menores de cobros: preservar `preapproval_id` en el login; prorrateo de upgrade mensual; el cron de Vercel Hobby solo permite 1 vez al día y `vercel.json` tiene crons horarios.
12. Prueba de pago real de monto bajo con Pablo presente.

### Producto e interfaz
13. **Tema:** el tema por usuario ya existe (086). Falta aclarar si "tema" incluye colores de marca, y la estadística en el superadmin de qué tema/color usan más los profesionales.
14. Logo en tema oscuro: casi no se lee (gris oscuro sobre fondo oscuro). Usar versión clara o SVG que cambie de color.
15. Dashboard: color de las flechas de variación (las cancelaciones aparecen en verde) y contraste del gráfico de ventas en oscuro.
16. Un email = una cuenta = un negocio. Mejora futura: varios negocios por email.
17. **Pixel de Meta** (solo conversado, no implementado):
    - Un pixel **por negocio**, con campo "ID de Pixel" en Configuración (admin) y una migración.
    - Cargarlo solo en las páginas públicas de reservas (`/[slug]`, `/booking`).
    - Eventos: `PageView`, `ViewContent`, `InitiateCheckout`, `Lead` o `Schedule` al confirmar la reserva, `Purchase` si hay abono.
    - Recomendado: API de Conversiones desde el servidor, con un token por negocio.
    - Falta saber si cada negocio tendría su propio pixel y si alguno ya tiene anuncios corriendo.
18. Repaso de pantallas principales (caja, calendario, POS) y pruebas visuales de la lista del `LEEME` de cada zip.

## Datos técnicos útiles
- El middleware **no exige sesión** en `/api/*`; solo bloquea negocios suspendidos.
- `tenant/info` y las rutas nuevas leen las columnas nuevas dentro de `try/catch`, para no caerse si la migración aún no está aplicada.
- La tabla `transactions` no tiene columna `appointment_id` en las migraciones, así que no se escribe.
- Sin probar en pantalla ni con datos reales: la vista agrupada, los botones de Mi Agenda y el cobro que completa la cita (se verificaron con `tsc` y lógica simulada).
- Los clientes importados o de otro sistema no tienen historial de citas en re-booking; su primera cita aquí seguirá diciendo "Nuevo".
