# Contexto para trabajar en re-booking sin romper nada (20 oct. 2026)

Léelo junto con `CLAUDE.md`. Resume lo aprendido leyendo el código de producción (`pdencina/barberia`, `main`, commit `26cd37b`, PR #41). Si algo de aquí contradice el código actual, manda el código: verifícalo antes de actuar.

## 1. Qué es y dónde vive
- re-booking: agenda online y gestión para barberías y centros (Estudio Levels es el negocio de Nico). Producción: 4 negocios reales, ~2.700 clientes. Entran más negocios pronto (Fluye Salón, Eco Barber, Blanco Estudio).
- Stack: Next.js 14.1.3 (App Router) + TypeScript + Tailwind + Supabase + Vercel (funciones en `pdx1`). Pagos: Mercado Pago (suscripciones de re-booking y abonos de reserva), TUU. Correos: Resend. Avisos: web-push / FCM.
- **Producción = `pdencina/barberia`, rama `main`.** Vercel despliega solo al mergear. Supabase de producción: `ulucmbuvupulwplsrcnx`. Supabase de pruebas: `rebooking-pruebas` (`ucwrdmwtlesayjxmlbve`).
- Nico es dueño del negocio y NO programa: prueba y decide. Pablo (`pdencina`) es el desarrollador y dueño del repo; solo revisa cada semana. Nico es colaborador: puede subir ramas, nunca a `main`. Nico mergea sus PR.
- Hablarle en español, informal, corto. Siempre pasos numerados: qué pegar, en qué ventana, qué debe salir.

## 2. Qué SÍ puedes hacer
- Leer todo el código y los docs. Crear una rama nueva desde `main` de producción.
- Cambios pequeños, un tema por commit, con `npx tsc --noEmit` limpio.
- Correr `npm run dev` y probar en `localhost:3000` (apunta al Supabase de PRUEBAS).
- Subir la rama a `pdencina/barberia` (nombre propio, nunca `main`) y dar a Nico el link para crear el PR.
- Escribir SQL como archivo `.sql` (aditivo, re-ejecutable, con consulta de verificación al final) para que Nico lo corra.

## 3. Qué NO puedes hacer (sin OK explícito de Nico en ese momento)
- Subir o empujar a `main`. Mergear PR. Reescribir historia de ramas compartidas.
- Correr SQL en el Supabase de PRODUCCIÓN (leer ni escribir). Nada destructivo. Nada de datos de prueba hacia producción.
- Tocar `.env*`, imprimir llaves/tokens, pedirlas o pegarlas.
- Correr `next build` sin avisar.
- Tocar dinero, caja, cobros, permisos, planes o la base de datos sin avisar antes y sin dejarlo apagado/igual por defecto.
- Crear PR si Nico no lo pidió.
- Usar los seeds `seed_presentacion.sql` / `seed_realistic.sql`: borran datos de todos los negocios.

## 4. Regla de oro antes de cambiar algo
**Busca todo lo que llama a la ruta, función o componente que vas a tocar** (pantallas, otras rutas, webhooks, crons, `mi-agenda`, la app móvil). Ejemplo real: `/api/public/book` NO es solo la reserva pública; `dashboard/mi-agenda` también la usa (con `clientEmail: null`). Exigir correo ahí rompía la agenda del profesional; se resolvió exigiéndolo solo a quien no tiene sesión (`getCurrentUserRoleAndTenant().role`).
Usa también la búsqueda de código o Graphify (workspace `re-booking`) para ver quién llama a qué.

## 5. Cómo funciona (lo esencial)
**Seguridad**
- Las rutas API usan `createAdminSupabase()` (llave de servicio, se salta RLS). **Cada ruta debe validar sesión y negocio** (`getCurrentUserRoleAndTenant`, `resolveTenantForRequest`, `isManagerLevel`). Nunca confiar en un `tenantId` que venga del navegador.
- `src/middleware.ts`: bloquea la API a negocios suspendidos (402), salvo rutas de pago/públicas (`/api/billing, checkout, plans, auth, cron, webhooks, mercadopago, public, booking, portal, cancel`).
- Roles: `super_admin`, `admin`, `receptionist`, `barber`, `client` (`src/lib/permissions.ts`). El profesional (`barber`) NO tiene el comodín `/dashboard`; solo sus pantallas. `/dashboard/superadmin` es solo de super_admin.
- Planes (`src/lib/plan-features.ts`, tabla `plan_limits.features`): módulos según plan Basic/Starter/Pro/Enterprise. El bloqueo de Basic es del menú (`basicLocked` en `sidebar.tsx`); ojo con los 4 negocios reales antes de endurecerlo.

**Reserva online (`/booking`)**
- Pasos: profesional → servicio → fecha y hora → datos → confirmada. Vistas "por profesional" o "por horario"; "Primer profesional disponible" (`src/lib/booking-rules.ts`).
- `POST /api/public/book`: valida vacaciones (`isOnVacation`), ventana de días (`booking_window_days`), cupo (`isSlotFull`/`exceededAfterInsert`, cupos por bloque solo con `business_category = 'kinesiologia'`), negocio suspendido. Busca cliente por **correo dentro del negocio**; si existe lo reutiliza y actualiza el teléfono; si no hay correo, crea un cliente nuevo cada vez (duplicados). Crea cita (`source: "link"`), servicios, correo de confirmación (cuenta contra la cuota), notificación al profesional/admins (`notify`) y correo al profesional.
- Abono con Mercado Pago: `POST /api/booking/create-deposit` NO crea la cita; arma la preferencia con los datos en `external_reference`. La cita la crea el webhook `POST /api/webhooks/deposit` al pagarse (no pasa por `public/book`).
- Otras rutas públicas: `/api/public/{availability,barber,barber-days,barber-services,barbers,business-info,cancel,client-lookup,confirm-attendance,first-available,reviews,services,slots-by-time,tenant-booking,waitlist}`.
- Consentimiento de promociones: casilla sin marcar por defecto (`marketing_consent`, migración 101; si falta la migración se ignora).
- Seguimiento de publicidad (`ad_attribution`, migración 112) solo si el negocio lo activó.

**Horas (trampa clásica)**
- Las citas se guardan como hora de Chile escrita como UTC. Strings sin zona se leen con `parseWallClock` (`src/lib/wallclock.ts`). No usar `new Date("YYYY-MM-DDTHH:mm")` ni `toISOString()` para "hoy".

**Base de datos / PostgREST**
- Si una tabla tiene 2+ FK a la misma tabla, `barber:profiles(name)` falla en silencio (lista vacía) → usar `profiles!barber_id(name)`. `transactions.created_by` no lleva FK a `profiles`.
- Más de 1.000 filas: usar `fetchAllRows`.
- Migraciones en `supabase/migrations/` (hasta la **112**). Aditivas y re-ejecutables (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`). El código tolera que falte una migración (reintenta sin las columnas nuevas y avisa "Falta aplicar la migración NNN"). **El SQL va ANTES que el código que lo usa.** Se prueba primero en `rebooking-pruebas`.
- Estado real de las migraciones en producción: NO confirmado. El `CLAUDE.md` dice que la 100 (centro de avisos) y la 101 (PIN con huella, fotos privadas, consentimiento) no estaban aplicadas al 7 oct. Confirmar con Nico/Pablo antes de asumir.

**Dinero y caja**
- Efectivo esperado = apertura + ingresos efectivo − egresos efectivo − retiros (`cash_withdrawals`) + ajustes (`cash_adjustments`). Reportes de problema (`problem_reports`) en rojo hasta que el admin los resuelve con PIN.
- Comisión/arriendo: reglas de signos en `src/lib/ledger.ts`; libro `professional_ledger`; `accounting_month`.
- `pos/checkout` confía en los totales del navegador; hay verificación en modo comparación (`src/lib/checkout-check.ts`) que solo anota, no cambia el cobro. No cambiar la lógica de cobro sin autorización.
- Nómina (`payroll.ts`): ningún valor legal fijo en el código. Remuneraciones está oculta (solo super_admin).

**Cron (`vercel.json`)**: reminders, post-service, suspend-past-due, annual-renewals, platform-alerts, demo-refresh.

## 6. Cosas abiertas que conviene saber (no son tu tarea salvo que Nico lo pida)
- Seguridad abierta: `mercadopago*`, `tuu*`, `GET /api/clients` sin chequeo de rol, actualizar Next 14.1.3 (CVE). Ver `docs/auditoria-rutas-api.md`.
- Correo de bienvenida y otros mensajes pueden llevar el dominio viejo `barberia-kappa-weld.vercel.app`; en Vercel falta `NEXT_PUBLIC_APP_URL=https://www.re-booking.cl` y borrar `APP_USR`.
- El entorno Preview de Vercel apuntaba al MISMO Supabase de producción (según el traspaso del 5 oct.): confirmar.
- App móvil (Capacitor): rama `app/respaldo` en el repo de Nico; fuera del alcance de los cambios web normales.

## 7. Flujo de cada cambio (checklist)
1. Hablar con Nico: qué quiere, en una frase. Si ya está decidido en `docs/PLAN-OCTUBRE.md`, hacerlo.
2. `git fetch https://github.com/pdencina/barberia.git main` y rama nueva desde ahí.
3. Buscar el código real y **todos los llamadores** (sección 4).
4. Cambio mínimo. Lo riesgoso, apagado por defecto.
5. `npx tsc --noEmit` limpio. Probar en `localhost:3000` (Supabase de pruebas).
6. Commit (trailers de `CLAUDE.md`), subir la rama (nunca `main`).
7. Dar a Nico: el link para crear el PR (`https://github.com/pdencina/barberia/compare/main...RAMA?expand=1`), si hay SQL, qué mirar al probar y cómo volver atrás (Vercel → Rollback).
8. Informar con honestidad qué se probó y qué no.

## 8. Cambio pendiente de entregar (20 oct.)
Correo obligatorio en la reserva online. Parche: `email-obligatorio.patch` en la rama `claude/elegant-davinci-x8tr7e` de `nicoperezj1/git-estudio-levels`. Toca 3 archivos: `src/app/booking/page.tsx` (campo "Email *", botón apagado sin correo válido), `src/app/api/public/book/route.ts` (exige correo salvo personal con sesión) y `src/app/api/booking/create-deposit/route.ts` (exige correo). No toca la lista de espera, el calendario del admin ni el webhook de abonos. Sin SQL. Falta: aplicarlo, `tsc`, probar (reserva con y sin correo; cita desde Mi agenda sin correo; reserva con correo envía confirmación), subir rama y crear PR.
