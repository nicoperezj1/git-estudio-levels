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
- Usuarios de prueba (clave `Prueba2026!`; el admin conserva la suya): admin `nicoperezj1@gmail.com` PIN 3333; recepción David `nicoperezj1+recepcion@gmail.com` PIN 1234; arriendo Matías PIN 1111; comisión 48% Camila PIN 2222; comisión 40% Diego PIN 4444 y Valentina PIN 5555.
- Servidor local: en **una** ventana de Terminal `npm run dev`; otros comandos en otra pestaña. Si falla ("Cannot find the middleware module", pantalla rara, puerto 3000/3001 ocupado): detener, `rm -rf .next`, `npm run dev`.
- En la Mac (no web) Claude puede correr la app y los scripts directamente; aun así, nada de `next build` sin avisar.

## 5. Arquitectura y trampas que ya nos mordieron
- Next.js 14.1.3 App Router + TypeScript + Tailwind + Supabase (Vercel). Código en `src/`, SQL en `supabase/migrations/` (hoy hasta la **099**).
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

## 7b. Próximo proyecto: app móvil (propuesta, sin aprobar)
Plan completo en `docs/PLAN-APP-MOVIL.html` (también publicado como página): Capacitor sobre la misma app Next.js, disposición móvil por rol, centro de notificaciones (`notifications`, `notification_preferences`, `device_tokens`, FCM + web-push), Fase 0 de seguridad (cerrar `/api/push/send`, que hoy no pide sesión) y cumplimiento de la Ley 21.719 antes del 1 dic. 2026 (política de privacidad que hoy no existe, contrato de encargo, canal de derechos). Decisiones pendientes al final del plan.

## 8. Commits
Terminar cada mensaje de commit con:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```
(No incluir identificadores de modelo ni de sesión de otra herramienta si no se piden.)
