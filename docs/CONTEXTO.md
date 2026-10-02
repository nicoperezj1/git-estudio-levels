# Contexto: re-booking (Estudio Levels)

Última actualización: 2 de octubre de 2026. Léelo al empezar una sesión nueva.

> **Producción es la referencia, no esta copia.** El repo oficial es `pdencina/barberia`, rama `main` (público; se puede clonar solo para leer). Esta rama de trabajo se actualiza trayendo ese `main` (`git fetch https://github.com/pdencina/barberia main` y merge). **Antes de cualquier tarea, comparar con producción**, porque Pablo también cambia código. A 2 de oct.: producción **ya incluye** los parches 0011 y 0012 (commit `f7931c2`), la corrección de seguridad de `/api/barberos` (`d01bef1`) y el arreglo de Suspense. **No incluye aún** el parche 0013 (Nuevo = primera cita + el cobro completa la cita).

## Proyecto
- SaaS de agenda y punto de venta (POS) para barberías. Next.js 14 + Supabase, desplegado en Vercel. Código en `src/`, migraciones SQL en `supabase/migrations/`.
- **Quién es quién:** Nicolás es el dueño de Estudio Levels y trabaja en este repo (`nicoperezj1/git-estudio-levels`). Pablo es el desarrollador. Su repo oficial es `pdencina/barberia`, rama `mejoras/tema-caja-superadmin`. Pablo aplica los parches, corre las migraciones SQL **a mano** en el SQL Editor de Supabase de producción y despliega.
- **Rama de trabajo:** `claude/hopeful-mayer-jtqlh4`.

## Reglas de trabajo
- Responder en español, simple y sin jerga.
- Cambios pequeños y revisables. Correr `npx tsc --noEmit` antes de cada commit. Antes hay que correr `npm ci`.
- Las migraciones deben ser aditivas y re-ejecutables (`IF NOT EXISTS`), y entregarse como `.sql` listo para pegar, con consulta de verificación al final.
- Cada entrega a Pablo es un **zip** con: parche (`git diff`), SQL de producción y `LEEME.txt` con pasos y lista de pruebas. Antes de entregarlo, verificar que el parche aplica con `git apply --check` sobre la base correcta.
- No tocar `.env*` ni subir llaves. No crear PR salvo que lo pidan.
- Las rutas API usan `createAdminSupabase()`, que se salta las reglas de acceso de Supabase. Por eso cada ruta debe validar sesión y negocio (`resolveTenantForRequest`, `getCurrentUserRoleAndTenant`, `canAccessBarber`, `isManagerLevel`).

## Ya hecho y subido a la rama
**Commit `80cee4e`** (primer parche, ya enviado a Pablo):
- Calendario en celular con selector Tarjetas/Grilla; 1/3/7 días por profesional.
- Tema claro/oscuro por usuario (Mi Perfil > Mi tema, columna `profiles.theme`, migración 086). El tema del negocio es el valor por defecto.
- Precios sin múltiplos de $500 (`step="1"`).

**Commit `e054b8f`:** la propina del POS acepta cualquier monto.

**Commit `4c242cb`:** informe `docs/auditoria-rutas-api.md` (solo lectura, ver más abajo).

**Commit `45a26c4`** (zip `cambios-1oct-vista-agrupada-whatsapp-agenda`):
- Configuración > Calendario: casilla "Vista profesionales agrupados por semana". Solo para negocios de 2 a 4 profesionales; el servidor lo exige. Columna `tenants.calendar_group_week` (migración 087). Con la casilla activa, los botones 1/3/7 días funcionan con todos los profesionales a la vez. Apagada por defecto.
- Celular: abre en **Grilla** por defecto; "Tarjetas" es opcional y se recuerda en `localStorage`. En Tarjetas y en las vistas de varios días se ven los bloqueos manuales.
- Mi Agenda: botones **WhatsApp** y **Ficha del cliente** en cada cita.
- Mensaje de WhatsApp compartido con el Calendario (`src/lib/whatsapp-confirm.ts`): "Hola Matias! Te escribimos desde Estudio Levels para confirmar tu hora de Solo corte Nicolas el jueves, 1 de octubre a las 10:00. Nos confirmas si asistirás? Gracias!". El nombre del negocio sale del negocio del usuario logueado; nunca va fijo.
- Recepción ahora ve "Mi Perfil" en el menú.
- API nueva: `src/app/api/settings/calendar-view/route.ts`.

**Commit `4cf7be7`** (zip `cambios-1oct-nuevo-y-cobro-completa-cita`):
- Etiqueta "NUEVO" = primera cita del cliente, o cita sin ficha de cliente vinculada. Las citas canceladas o de "no se presentó" no cuentan como visita previa (`src/lib/new-client.ts`).
- Al cobrar en el POS, la cita queda **Completada**. Si viene del botón "Cobrar" del calendario, se completa esa cita (`appointmentId`). Si se cobra directo, se completa la cita activa de hoy de ese cliente con ese profesional, solo si hay exactamente una.

Los dos zips incluyen un parche incremental y uno acumulado desde `e386ee8`. Pablo usa **solo uno** según lo que ya haya aplicado.

## Pendiente / ideas
1. **Seguridad (urgente):** el informe `docs/auditoria-rutas-api.md` clasifica las 149 rutas con `createAdminSupabase()`: 30 públicas a propósito, 74 que validan, **45 a revisar**. La cadena de `/api/barberos` (cambiar roles y PIN sin sesión) **ya la corrigió Pablo en producción** (`d01bef1`); queda limitar las columnas que devuelve `GET /api/barberos/[id]` (hoy incluye el PIN). Siguen abiertas, sin cambios en producción: `pos/checkout`, `comisiones/adjust`, `arriendo/adjust`, `caja/reopen`, `pos/verify-pin`, `wallet`, `loyalty/earn` y `redeem`, `mercadopago*`, `tuu*`. El informe trae un orden de arreglo en commits pequeños. **Antes de arreglar**, confirmar qué pantallas llaman a cada ruta, porque algunas se llaman de servidor a servidor, sin cookies.
2. ~~Build de Vercel (`suscripcion/resultado` sin `Suspense`)~~: ya corregido en producción (`ef85865`).
3. **Pixel de Meta (solo conversado, no implementado):**
   - Un pixel **por negocio**, con campo "ID de Pixel" en Configuración (admin) y una migración.
   - Cargarlo solo en las páginas públicas de reservas (`/[slug]`, `/booking`).
   - Eventos: `PageView`, `ViewContent`, `InitiateCheckout`, `Lead` o `Schedule` al confirmar la reserva, `Purchase` si hay abono.
   - Recomendado: API de Conversiones desde el servidor, con un token por negocio.
   - Falta saber si cada negocio tendría su propio pixel y si alguno ya tiene anuncios corriendo.
4. Next 14.1.3 tiene una advertencia de seguridad; planificar la actualización después de la auditoría.

## Datos técnicos útiles
- El middleware **no exige sesión** en `/api/*`; solo bloquea negocios suspendidos.
- `tenant/info` y las rutas nuevas leen las columnas nuevas dentro de `try/catch`, para que el código no se caiga si la migración aún no está aplicada.
- La tabla `transactions` no tiene una columna `appointment_id` definida en las migraciones, así que no se escribe.
- Lo no probado en pantalla: la vista agrupada, los botones de Mi Agenda y el cobro que completa la cita se verificaron con `tsc` y con pruebas de lógica simulada, **no** contra datos reales. Faltan las pruebas visuales de la lista del LEEME de cada zip.
- Los clientes importados o de otro sistema no tienen historial de citas en re-booking; su primera cita aquí seguirá diciendo "Nuevo".
