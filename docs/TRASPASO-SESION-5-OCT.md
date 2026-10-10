# Traspaso de sesión — 4 y 5 oct. 2026 (Graphify, calendario, producción)

Contexto para continuar en otra sesión. Complementa `CLAUDE.md` (reglas) y `docs/CONTEXTO.md`.
No contiene llaves ni claves; nunca pegarlas aquí.

## 1. Estado del código y las ramas
- Rama de trabajo: `claude/hopeful-mayer-jtqlh4` (repo de Nico `nicoperezj1/git-estudio-levels`).
- **Cambio importante:** la rama por defecto de ese repo en GitHub ahora ES `claude/hopeful-mayer-jtqlh4` (antes `mejoras/tema-caja-superadmin`). Se hizo para que Graphify indexe el trabajo actual. Decidir al final si se devuelve; mientras tanto un clon o PR nuevo parte desde esta rama.
- Commits de esta sesión, ya subidos a la rama: `ce2710c` (nota en CONTEXTO sobre Graphify) y `e165e2b` (calendario, ver 3).
- Antes de subir algo: `git fetch` primero. Otra sesión de Claude ya subió a la misma rama (commits `fd75c8c` … `7254f7b`: seguridad de push/PIN/wallet, notificaciones con migración 100, PIN con huella migración 101, móvil, textos legales, fotos privadas, error legible al crear miembro). Hay riesgo de divergencia.
- **Producción** = `pdencina/barberia` `main` en `72b0165` (merge de la rama `octubre` de Nico hasta `415337b`, migraciones 086–099 sin 096). **No tiene** `fd75c8c`…`7254f7b` ni `e165e2b`, ni las migraciones 100 y 101.

## 2. Graphify
- Conector en línea: workspace `re-booking` (app.graphify.com/re-booking), repo `nicoperezj1/git-estudio-levels`, plan Free (solo código y README, no `docs/*.md`). Última indexación que vi: commit `7254f7b`, 1.756 nodos. El push de `e165e2b` lo reindexa solo (tarda).
- Grafo local: `~/barberia/graphify-out/` (`graphify update .` no usa IA ni cuesta). Se actualizó a `7254f7b`: 2.327 nodos, 6.041 conexiones, 179 comunidades. **No incluye `e165e2b`**: correr `graphify update .`.
- No se instaló el hook post-commit, no se nombraron las comunidades (`graphify label`) y no se revisó si `graphify-out/` va en `.gitignore`. Opcional.
- Beneficio práctico: consultar quién llama a qué y el impacto de un cambio antes de tocar. No acelera la app por sí solo.

## 3. Velocidad de la app (hallazgos y lo hecho)
**Hecho (`e165e2b`, sin probar por Nico):** nuevo `GET /api/calendar/barber-data` (`src/app/api/calendar/barber-data/route.ts`): valida sesión y negocio una vez, devuelve bloqueos (con vacaciones) y horarios de todos los profesionales en 1–2 llamadas. El calendario (`src/app/dashboard/calendario/page.tsx`) lo usa; los horarios se piden una vez y el día visto se calcula sin red. Antes eran ~16–24 llamadas por pantalla con 8 profesionales. `tsc` limpio.
Pasos para probar: traer la rama; `npm run dev`; entrar a `localhost:3000/dashboard/calendario` con el admin de pruebas; revisar profesionales, bloqueos, profesionales sin turno en gris, cambio de día, crear/borrar bloqueo y vacaciones.

**Pendiente (por orden):**
1. Caché en el navegador (SWR o React Query) en las pantallas más visitadas (dashboard, caja, calendario). 46 páginas hacen `useEffect`+`fetch` sin caché.
2. Rutas con muchas consultas seguidas; solo 13 de 185 usan `Promise.all`: `pos/checkout` (34 `await`), `public/book` (28), `remuneraciones/liquidacion` (26), `caja` (25). Revisar una por una (contar `await` no prueba que sean secuenciales).
3. Chequeo de sesión repetido en cada ruta (`getCurrentUserRoleAndTenant`: `getUser()` + consulta a `profiles`) y otra vez en `auth-wrapper`.
4. 38 `select("*")` que piden columnas de más.
5. Archivos gigantes por partir: `calendario/page.tsx` (~2.400 líneas), `pos-screen` (1.477), `configuracion` (1.230), `caja` (1.129).
6. Seis ayudantes de permisos distintos (`getCurrentUserRoleAndTenant`, `resolveTenantForRequest`, `isManagerLevel`, `requireRole`, `pinOr`, `canAccessBarber`): unificar en un solo "guardia" (ayuda a la auditoría de seguridad).
7. Posibles duplicados sin verificar: `entrega/support.js` y `landing-nuevo/support.js`. `resend.ts` (637 líneas) por partir.
8. No se midieron tiempos reales; confirmar con la pestaña de red del navegador o los registros de Vercel.

## 4. Error en producción: no se pueden agregar profesionales (Estudio Levels y Fluye Salón)
- **Causa NO confirmada.** No hay acceso a los registros de producción desde el código. Pista: producción no tiene `7254f7b`, así que el error al crear miembro sale como `{}` sin explicación.
- Cómo distinguirla por el mensaje que ve el usuario: "has alcanzado la cantidad máxima de profesionales…" = límite del plan (`tenants.max_professionals`); "Ya existe una cuenta con ese email" = email repetido; "No se pudo crear el perfil: column … does not exist" = falta una migración en producción; solo `{}` = falla del sistema de acceso (disparador `handle_new_user` u otro en la base).
- Dónde mirar (ahora que Nico tiene acceso): Vercel → Logs, buscar `[barberos] createUser fallo` (ese texto existe solo con `7254f7b`; sin él, buscar el POST a `/api/barberos`); Supabase → Logs → Auth, buscar "Database error creating new user".
- Que falle en los dos negocios apunta a algo común de la base de producción (migración o disparador distinto al de pruebas), no a un límite por negocio.
- **Urgente:** sin esto los negocios que entran la próxima semana no pueden cargar profesionales.

## 5. Accesos y separación del Supabase (estado según Nico)
- Pablo ya dio a Nico acceso a **Vercel y Supabase** (falta confirmar qué rol exacto en cada uno). No se dijo nada de GitHub Write ni de proteger `main`.
- Reglas que no cambian: nunca subir a `main`; nada destructivo ni datos de prueba hacia producción; el SQL va ANTES que el código que lo usa; nunca pedir ni pegar llaves.
- Esquema acordado/propuesto para pedirle a Pablo (nivel B): Nico mergea código a `main` con un PR que solo exige `tsc` (vuelta atrás con "Rollback" en Vercel); el SQL en producción lo corre Pablo, o Nico con protocolo (migraciones aditivas y re-ejecutables, respaldo previo, prueba antes en `rebooking-pruebas`). Decisión de Pablo.
- Separar re-booking de los datos de Pablo: **sigue sin saberse** si re-booking es un proyecto propio en el Supabase de Pablo o comparte proyecto. Si es propio: "Transfer project" a una organización nueva (30–60 min, conserva llaves y dirección; confirmarlo en la documentación de Supabase). Si comparte: proyecto nuevo con copia completa (1–3 días, con respaldo y prueba).
- No se recomienda "vacío ahora e importar después": deja dos bases vivas y la importación (usuarios de login, identificadores) es lo difícil. Mejor hacer la separación completa antes de que entren Fluye Salón, Eco Barber y Blanco Estudio.
- Con acceso a Supabase, qué falta: confirmar rol, **respaldo completo** (base, usuarios de login, archivos/fotos de clientes; ver si el plan tiene respaldos diarios), responder si es proyecto propio, y elegir noche tranquila avisando a los negocios con un día de anticipación.
- Idea ofrecida por Nico: preparar el trabajo en una copia de pruebas con solo la **estructura** de la base (sin datos) y ejecutar en una noche con aprobación de Pablo. La preparación no entra en esa noche; contar con unos días antes.

## 6. App móvil (iPhone y Android)
- Plan completo en `docs/PLAN-APP-MOVIL.html`: Capacitor sobre la misma app Next.js, centro de notificaciones, FCM + web-push, cumplimiento de la Ley 21.719 antes del 1 dic. 2026.
- De Supabase la app solo necesita la dirección del proyecto y la llave pública (anon), que ya están en el web (Supabase → Project Settings → API). **Nunca** la llave `service_role` en la app. No pedirlas ni pegarlas en el chat. Para avisos al celular se necesita configurar Firebase (FCM), no Supabase.
- Fase 0 del plan (cerrar `/api/push/send`): la sesión anterior ya cerró `push/send` y `push/subscribe` en `fd75c8c`; confirmar en el código.

## 7. Pendientes anteriores que siguen abiertos (de `CLAUDE.md` §7, no revisados en esta sesión)
Que Pablo corra el SQL y despliegue lo entregado; Remuneraciones (Fase 7) oculta; cita creada desde el calendario con cliente nuevo que "no aparece" (si se repite, pedir paso exacto y mensaje rojo); correo de solicitud de insumos (Resend); regenerar `MP_WEBHOOK_SECRET` y token expuestos; seguridad abierta en `mercadopago*`, `tuu*`, `pos/checkout` (recalcular totales en el servidor), `GET /api/clients`; actualizar Next 14.1.3 (CVE).

## 8. Qué pasar a Pablo / orden recomendado
1. Ver el error de profesionales en los registros (punto 4) y corregirlo.
2. Respaldo completo de producción.
3. Definir con Pablo si es traspaso o copia del Supabase.
4. Subir la rama `octubre` a su repo (`git push https://github.com/pdencina/barberia.git claude/hopeful-mayer-jtqlh4:octubre`) cuando Nico lo pida, avisando que incluye migraciones 100 y 101 que se corren antes del código.
5. Hacer todo antes de que entren Fluye Salón, Eco Barber y Blanco Estudio (próxima semana).

## 9. Actualización 5 oct. (tarde-noche): lo que quedó pendiente de probar
**Ya en producción (mergeado por Nico):** PR #3 (importador de clientes: Excel real, `;`, tabulador, título `Teléfono`, RUT, hoja "Clientes") y PR #4 (reserva: vista por horario incluye admins que atienden y salta la elección si hay un solo profesional). Arreglo aplicado a mano en Supabase de producción (proyecto `EstudioLevels`): `handle_new_user()` con `search_path=public`; con eso se crean profesionales en Estudio Levels y Fluye Salón y el correo de credenciales llega.

**Producción = Supabase `EstudioLevels` (ID `ulucmbuvupulwplsrcnx`). El entorno Preview de Vercel apunta al MISMO proyecto** (hay que apuntarlo a pruebas).

**En la rama y NO en producción (21 commits):** seguridad (`fd75c8c`, cierre de rutas de citas en `04246e7`, PIN con huella `0613563`), notificaciones (migración 100), fotos privadas y consentimiento (101), barra móvil, calendario rápido (`e165e2b`), error legible al crear miembro (`7254f7b`), POS en modo comparación, importar por espacios (`a81bc8c`), superadmin importa al negocio que ve (`d5b5d90`), exportación completa (`a68a71b`, la dejó fuera Nico a propósito). El commit del workflow `e19f3ce` no se puede subir sin permiso `workflow` en el token.

**Pruebas ya hechas (sin sesión):** `tsc` limpio; 27 comprobaciones de lógica (PIN, avisos, totales); 20 rutas de seguridad rechazan sin sesión (401/403); reserva pública del negocio de pruebas muestra horas. 
**Pendiente (necesita sesión iniciada):** calendario, crear miembro, importar, notificaciones, PIN con huella, fotos, barra móvil. La base de pruebas NO tiene las migraciones 100 y 101: correr `entrega-produccion/SQL-PARTE-2.sql` en `rebooking-pruebas` (no en EstudioLevels). Guía de pasos: `docs/PRUEBAS-3-OCT-NOCHE.md`.
**Orden:** SQL 100/101 en pruebas -> pruebas con sesión -> PR chico de seguridad a `main` -> SQL 100/101 en producción con respaldo -> resto.
