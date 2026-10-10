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
>   - Fidelidad: "puntos por compra" editable por negocio (Fidelidad); `loyalty/earn` y `redeem` exigen sesión y negocio. Sin SQL.
>   - Recepción: campo "Nombre de encargado" (saludo "Hola David" en Caja y POS) y la ficha de un Recepcionista oculta link de agenda, slot, modalidad, comisión, arriendo, horario, servicios y presentación. **Migración 089** (`profiles.manager_name`), el código tolera que aún no exista.
>   - Calendario celular: un toque abre Agendar/Bloquear; "Atrás" y tocar fuera solo cierran el cuadro (también detalle de cita y bloqueo); líneas de hora y media hora visibles pero sutiles.
>   - Calendario varios días (7 días con varios profesionales): un clic en un espacio vacío abre Agendar/Bloquear para ese profesional y ese día.
> - **Fase 1 completa en código; falta probarla en pantalla** (Nico prueba en localhost). Para ver el nombre de encargado hay que correr `supabase/migrations/089_profile_manager_name.sql` en el SQL Editor **de pruebas**.
> - **Fase 2 (finanzas) hecha en código; falta probarla.** Necesita `supabase/migrations/090_finanzas_fecha_contable.sql` (aditiva; respaldo antes). Sin ella todo calcula como antes y el panel de gastos del mes avisa que falta la migración.
>   - "Corresponde al mes" (`transactions.accounting_month`) y "Emitido por" (`created_by`) en movimientos manuales. Movimientos viejos: columna vacía = mes de su fecha de creación (no se cambia ningún dato). Ayudante: `src/lib/accounting.ts`.
>   - Cierre mensual (PDF), informe mensual y comparativo cuentan por fecha contable y ahora leen **todas** las filas (antes máximo 1.000, subestimaba meses grandes), con plan B por fecha de creación.
>   - Ingresos y egresos: columnas hora, fecha, tipo, descripción, profesional/corresponde a, emitido por, cliente, método, monto; filtro "Corresponde al mes"; "Exportar a Excel" (CSV).
>   - Gastos del mes (Cierre mensual, solo admin): impuestos, comisión máquina (con ayuda débito/crédito), arriendo/dividendo, insumos, luz, publicidad, honorarios, equipamiento. Se guardan como egresos (`fixed_category`, método transferencia para no tocar la Caja) y salen en egresos, cierre e informes.
>   - Cerrar / Reabrir mes (solo admin, tabla `month_closings` con registro). Mes cerrado bloquea movimientos manuales y gastos del mes de ese mes; las ventas del POS nunca se bloquean. `finanzas/[id]` ahora exige que el movimiento sea del negocio.
>   - **No cubierto aún:** el Dashboard principal sigue por fecha de creación; "Emitido por" queda vacío en ventas del POS (el checkout no se tocó a propósito: riesgo de romper cobros). Antes de publicar en producción: comparar el cierre de septiembre antes y después en el sitio de prueba (solo deben sumarse los egresos marcados para septiembre).
> - **Lección (3 oct.):** `transactions.created_by` NO debe tener llave foránea a `profiles`: `transactions` ya tiene `barber_id -> profiles` y una segunda relación vuelve ambiguos los `barber:profiles(name)` de Caja, Dashboard y Finanzas (listas vacías). Regla: al agregar columnas a `transactions` que apunten a `profiles`, no crear FK; resolver el nombre con consulta aparte. Si 090 ya se corrió con la FK, volver a correr el 090 actual (la quita).
> - **Fase 2 probada por Nico en pruebas (3 oct.):** gastos del mes, egreso de septiembre en el cierre, mes cerrado bloquea movimientos, filtros y columnas de Ingresos/Egresos. Cerrada.
> - **Fase 3 (libro de movimientos del profesional) hecha en código; falta probarla.** Necesita `supabase/migrations/091_libro_profesional.sql` (aditiva; respaldo antes). **Todo apagado por defecto:** interruptor por negocio en Configuración > "Arriendo y Comisión" (`tenants.pro_ledger_enabled`). Apagado, Arriendo y Comisiones calculan EXACTAMENTE como antes (las pantallas viejas siguen intactas como `ComisionesLegacy` / `ArriendoLegacy`).
>   - Regla de signos (una sola para las dos pantallas): `effect` +1 a favor del profesional / −1 en contra. Comisión: total = comisión sobre servicios + Σ efecto×monto. Arriendo: total = arriendo (días × valor) − Σ efecto×monto. Probado con un caso a mano (`src/lib/ledger.ts`).
>   - Automático: propinas del mes (`transactions.tip_amount`, 100% al profesional) y comisión por venta de productos (`products.sales_commission_type/value`, definida en cada producto del inventario, % o monto fijo por unidad). Los productos NO suman a la base de la comisión. Las ventas "[AJUSTE MANUAL]" antiguas no cuentan (ahora esos ajustes viven en el libro).
>   - Del libro (admin, con motivo y quién lo hizo; se anulan, no se borran): dinero a su favor, consumibles, descuento por planilla, descuento/quincena (solo comisión) y movimiento manual (el admin elige el signo).
>   - "Pagado" (comisión) / "Cobrado" (arriendo) editable con registro de cambios (`professional_settlements` + `_log`).
>   - **Arriendo, días trabajados (lo principal, siempre a la vista en cada profesional):** botones − / + con el cálculo `N días × valor = total`, y un **calendario del mes** para elegir los días concretos (`worked_dates`, columna agregada a 091: si 091 ya se corrió, volver a correrla). Los días libres del profesional (según `barber_schedule`) salen en otro color pero se pueden elegir igual; un punto verde marca los días con citas completadas. Prioridad: calendario > cantidad a mano (`days_override`) > registro antiguo > automático (citas completadas).
>   - POS: con el libro encendido se pregunta propina en TODA venta (también efectivo) con sugerencia 10% y otro monto; `pos/checkout/tip` ahora exige sesión y negocio.
>   - Recibo PDF por profesional y mes (`/api/profesionales/libro/recibo`, librería nueva `pdf-lib`): verde suma, rojo descuenta, con logo si es PNG/JPG.
>   - **No cubierto aún:** Mi Billetera (vista del propio profesional) sigue con el cálculo antiguo; "descuento por planilla" se crea hoy a mano en el libro (el flujo con código es Fase 5); remuneraciones (Fase 7). Antes de producción: comparar septiembre calculado a la manera antigua y con el libro, profesional por profesional, en el sitio de prueba.
> - **Fase 4 (inventario y compras) hecha en código; probada por Nico (pendiente solo que el correo llegue: revisar Resend con Pablo).** Necesita `supabase/migrations/092_inventario_compras.sql` (aditiva; respaldo antes). Todo producto existente queda como **Venta** (sigue en el POS igual que hoy); solo los marcados **Insumo** salen del POS.
>   - Inventario: tipo Venta/Insumo, categorías (Cosméticos, Aseo, Consumibles, Generales + "+ Nueva categoría" propia del negocio), filtro Todos/Venta/Insumos. Las APIs de productos toleran que 092 aún no esté (guardan sin esas columnas).
>   - **Solicitud de insumos** (`/dashboard/solicitud`, recepción y admin): lista de insumos con existencias y cantidad a comprar + "otros productos" + nota; guarda y envía correo (a `tenants.supply_request_email` elegido por el admin en Configuración, o al correo del admin); el correo no hace fallar la solicitud. Queda en una tarjeta del Dashboard (solo admin) hasta que el admin la **borra a mano** (se marca borrada, no se destruye).
>   - **Proveedores** (`/dashboard/proveedores`, admin; hoy en el menú Negocio, la Fase 6 lo mueve a "Mi negocio"): nombre y celular a mano; "Cotizar" elige productos del inventario con cantidad y "¿producto nuevo?"; mensaje automático (saludo Buenos días/Buenas tardes/Buenas noches según hora de Chile, nombre del admin y del negocio, editable) y botón WhatsApp (`wa.me`).
>   - El nombre del administrador en el mensaje sale de su perfil: si el perfil tiene el correo como nombre, cambiarlo en Mi Perfil.
> - Siguiente: probar las fases 5, 6 y 7 y los pendientes fuera de fase (ver `docs/PLAN-OCTUBRE.md` sección 10). Luego: paquete para Pablo (parches + SQL 089 a 096 en orden).
> - **Fase 7 (Remuneraciones) hecha en código; SIN PROBAR.** Necesita `supabase/migrations/096_remuneraciones.sql` (módulo nuevo; tablas `employee_files`, `payroll_params`, `payslips`; respaldo antes). La plantilla Excel de Nico (`Plantilla_Liquidacion_Sueldo_Chile.xlsx`, 3 oct.) se revisó y se cotejó: con topes en 0 y los mismos números el motor da EXACTAMENTE lo mismo que sus fórmulas (imponible, AFP, salud, AFC, líquido, aportes). Se agregaron lo que ella traía y faltaba: RUT/cargo/centro de costo (`employee_files.rut/position/cost_center`, 096), identificación del empleador (nombre, RUT, dirección del negocio), sección Pago y constancia (forma, fecha, banco, referencia, N° comprobante, observaciones) y descuentos tipo Legal (pensión/retención judicial, cuota sindical) que NO cuentan para el 15%.
>   - **Ningún valor legal está fijo en el código.** UF, UTM, sueldo mínimo, horas de jornada completa, topes (AFP/salud y cesantía, en UF), tasas (salud, SIS, mutual, reforma Ley 21.735, cesantía trabajador/empleador) y tramos del impuesto único (UTM) se cargan en "Parámetros del mes". Herencia: negocio del mes → negocio último mes anterior → globales (super admin) del mes → globales anteriores. Sin parámetros no se emite (se avisa qué falta).
>   - Motor (`src/lib/payroll.ts`, probado con script y valores inventados): sueldo proporcional a días pagados (30 − faltas − licencias − días previos al ingreso), comisiones del libro, semana corrida sugerida (editable), gratificación automática 25% con tope 4,75 ingresos mínimos/12 (o manual/sin), tope imponible, AFP, salud 7% o plan Isapre en UF (el TOTAL del plan; lo adicional es lo que pasa del 7%), cesantía solo indefinido, impuesto único calculado con la marca Tributable (corregible a mano), quincena y planilla desde el libro, aportes del empleador con tope (SIS, cesantía, mutual, reforma), costo empresa y revisiones (sueldo mínimo proporcional por horas, aviso 15% [planilla y otros; la quincena no cuenta], líquido > 0, parámetros).
>   - Pantalla `/dashboard/remuneraciones` (Mi negocio): Liquidaciones (editor con cálculo en vivo en el navegador; el servidor SIEMPRE recalcula al guardar), Fichas laborales (marca `profiles.has_labor_contract`), Parámetros del mes, Guía. Estados borrador → emitida → pagada. Al pagar se crea el egreso "Remuneraciones - {nombre} ({mes})" en las finanzas del mes (no se puede con el mes cerrado). PDF con logo (`/api/remuneraciones/pdf`). Aviso fijo: "Herramienta de apoyo; valida con tu contador".
>   - **No cubierto:** Libro de Remuneraciones Electrónico y archivo Previred (solo la guía); feriados del mes para la semana corrida (se sugiere con los domingos; ajustar a mano); propinas siguen aparte.
>   - **Probar en pruebas:** correr 096; crear ficha de un profesional; cargar parámetros con valores de Previred; preparar la liquidación de septiembre y comparar con el Excel de Nico; emitir, bajar el PDF, marcar pagada y ver el egreso en Ingresos/Egresos.
> - **Fase 6 (Mi negocio y reservas) hecha en código; SIN PROBAR.** Necesita `supabase/migrations/095_mi_negocio_reservas.sql` (aditiva; respaldo antes; por defecto todo queda como hoy).
>   - **Menú "Mi negocio"** (admin): Vacaciones, Comisiones, Arriendo, Servicios, Proveedores (salieron de Negocio/Configuración; la página `/dashboard/mi-negocio` los lista). Remuneraciones se agrega en la Fase 7.
>   - **Vacaciones** (`/dashboard/vacaciones`, `professional_vacations`): rango por profesional; sin horas en la reserva online (`availability`), el selector de fecha las salta (`barber-days` → `closedDates`), `book` las rechaza, "primer disponible" las excluye, y el calendario las muestra como bloqueo de todo el día "Vacaciones" (solo lectura, viene de `/api/barber/blocks`). Las citas que ya existían no se tocan: al guardar se avisa cuántas hay.
>   - **Primer profesional disponible, 3 reglas** (Configuración > Preferencias de reserva; `tenants.booking_rule`, `booking_rule_pros`): 1 menos agenda (por defecto = lo de siempre), 2 primera hora (empate: prioritarios, luego menos citas), 3 % objetivo semanal (lun–dom, el resto se reparte entre los sin meta; cuenta citas con `appointments.auto_assigned`). Lógica en `src/lib/booking-rules.ts` (probada con script). "Recomendado por estadísticas" usa ventas de servicios del mes anterior (min 10%, máx 60%, nuevo = promedio) y solo rellena los campos. Tarjeta "Reservas automáticas" en el Dashboard (solo con la regla 3) con aviso de recomendación nueva al empezar el mes. En la vista por horario, cuando hay 2+ profesionales a esa hora aparece el botón "Primer profesional disponible" que aplica la regla (`/api/public/first-available?slot=&candidates=`).
>   - Límite: el flujo con depósito (Mercado Pago) no marca `auto_assigned`.
>   - **Probar en pruebas:** correr 095; agregar vacaciones a un profesional y mirar el link de reserva y el calendario; en Preferencias elegir cada regla y reservar con "Primer profesional disponible" (la 3 con % distintos: ver la tarjeta del Dashboard).
> - **Fase 5 (Standby y caja) hecha en código; SIN PROBAR (Nico duerme; probar al despertar).** Necesita `supabase/migrations/094_standby_caja.sql` (aditiva; respaldo antes; todo queda APAGADO por defecto). Nota: la 093 es la de cupos por bloque.
>   - **Seguridad (5a):** `pos/checkout` pide sesión y el profesional debe ser del negocio de quien cobra (los montos NO se tocan; recálculo en servidor y verificación del pago de Mercado Pago siguen pendientes); `pos/verify-pin` pide sesión, solo admins del mismo negocio, máx. 8 fallos / 10 min (en memoria); `caja/reopen` solo admin/recepción del mismo negocio; abrir/cerrar caja (`POST/PATCH /api/caja`) piden sesión y el negocio sale de la sesión.
>   - **Standby nuevo** = el MISMO Punto de Venta con el profesional ya identificado por PIN (`src/components/pos/pos-screen.tsx` con `standby={...}`; `dashboard/pos/page.tsx` ahora solo lo monta; `standby-v2.tsx` es la pantalla de PIN). Misma venta que el POS (cliente, alta rápida de cliente, cupón, descuento con PIN admin, puntos de fidelidad, propina, pago dividido, citas), así que todo repercute igual en ingresos, caja, cierre mensual y métricas. Diferencias solo en el standby: profesional fijo, SUS servicios (de `barber-services`, con su precio) + productos de venta y el control del efectivo (abajo). Encabezado `standby-header.tsx`: saludo, efectivo en caja, Reportar problema, Descuento por planilla y Cerrar sesión. Se activa en Configuración > Caja y Standby (`tenants.standby_v2_enabled`); apagado = el Standby de siempre (`LegacyStandby`).
>   - **Reducción de efectivo:** el admin fija un tope (`tenants.cash_cap`, por negocio porque la caja es por negocio; la tabla `branches` no se usa en la caja). Al cobrar (Standby nuevo y POS) si el efectivo esperado pasa el tope sale "Haz una reducción de $X y déjalo en la caja fuerte" con Confirmar / Reportar problema. El monto lo calcula el SERVIDOR (`/api/caja/retiros`: esperado − tope); se guarda en `cash_withdrawals` y `/api/caja` lo RESTA del esperado (también al cerrar la caja), así cuadra.
>   - **Control del efectivo en Standby (modelo de Nico, 3 oct.; SQL `097_ajustes_caja.sql`, aditiva):** el objetivo del Standby es que NO se pierda efectivo. Al entrar con el PIN sale **"Dinero en caja $X"** y se pide confirmar si coincide con lo que hay de verdad; si no, **Reportar problema** (contexto + consentimiento; se puede seguir vendiendo). El reporte queda en **rojo** en el Standby de todos (aviso `GET /api/problemas?summary=1`, abierto a cualquier sesión del negocio) hasta que el **administrador entre al Standby con su código** (entra siempre en la vista de VENDER porque en algunos negocios también cobra; una pestaña "Revisión de caja" con contador rojo, o el botón "Resolver ahora" de la franja roja, abre la revisión), declare **cuánto efectivo hay realmente** y deje la **glosa de la solución** (`POST /api/problemas/resolver`, valida el PIN admin en el servidor, máx. 8 fallos/10 min). La diferencia contra el sistema queda como **ajuste de caja** (`cash_adjustments`, con signo, con glosa) que `/api/caja` suma al efectivo esperado (también al cerrar), y los reportes quedan resueltos con su glosa. El Dashboard solo deja "Resuelto" a mano para reportes de contexto "otro". **Caja = rastro completo para cuadrar (pedido de Nico):** la tabla "Movimientos del Día" muestra TODO en orden de hora: apertura, ventas (con **Origen**: Standby / Punto de venta, y **Emitido por**: el profesional que entró con su PIN en Standby, o la persona con la sesión en el POS), egresos, retiros a la caja fuerte y ajustes de caja, con una columna **"Efectivo en caja"** acumulada después de cada fila (el último valor = el esperado). Filtros por origen y por profesional. Datos: `transactions.created_by` (se llena ahora en `pos/checkout`) y `transactions.origin` (097, tolerante si falta). También arregla el "Emitido por" vacío de Ingresos/Egresos para ventas nuevas (las antiguas quedan sin dato). Mientras hay un problema de caja abierto NO se pide reducción de efectivo (el monto del sistema no es confiable; `/api/caja/retiros` responde 409 y el aviso no sale): la reducción se vuelve a calcular cuando el admin declara el efectivo real. Los pagos con tarjeta usan la máquina igual que el POS (ese dinero no se pierde: va a la cuenta del negocio o al POS personal del profesional en arriendo).
>   - **Descuento por planilla:** el profesional genera un código de 6 caracteres (`/api/planilla`); recepción/admin lo ingresa en Caja > "Descuento por planilla" (`/api/planilla/aprobar`): recién ahí baja el stock (movimiento `out_use`) y se anota en el libro (`professional_ledger`, tipo `payroll_discount`, resta). Si el profesional tiene contrato (`profiles.has_labor_contract`, columna nueva, hoy sin pantalla para marcarla: la Fase 7 trae la ficha laboral) y el descuento supera el 15% de lo ganado en el mes (comisión sobre servicios + descuentos ya aprobados), pide confirmar. Limitación: el código lo crea quien tiene la sesión (tablet) con el id del profesional que pasó por PIN; igual que `pos/checkout`, no hay token firmado del PIN.
>   - **Apagar caja (opcional por negocio, SQL `098_caja_bloqueo.sql`, `tenants.caja_lock_enabled`, apagado por defecto; se activa en Configuración > Caja y Standby; sin activar no hay botón y se ignora cualquier bloqueo viejo):** botón en Caja Y en el Punto de Venta del computador general (mismo bloqueo compartido, `src/components/caja/caja-lock.tsx`, llave `caja_off_{negocio}` en el navegador; el Standby tiene su propio PIN); oculta todo y se enciende con el PIN de recepción/admin (`/api/caja/desbloquear`, máx. 8 fallos / 10 min). El bloqueo vive en el navegador (localStorage), no en la base.
>   - **Probar en pruebas:** correr 094; Configuración > Caja y Standby: activar Standby nuevo y poner un tope bajo (ej. 20.000); en Standby cobrar en efectivo hasta pasar el tope; confirmar la reducción y ver en Caja que el esperado baja; reportar un problema y verlo en el Dashboard; generar un código de planilla, aprobarlo en Caja y ver stock y libro; Apagar caja y encenderla con el PIN 1234.
> - (anterior) Fase 3, ver `docs/PLAN-OCTUBRE.md` sección 5. Es de riesgo ALTO: con interruptor por negocio.
> - **Fase 0 pendiente con Pablo:** parche `0013`, sitio de prueba en Vercel. Claves expuestas (`MP_WEBHOOK_SECRET`, token `APP_USR`) por regenerar: urgente y no necesita código.
> - Nico prueba en su computador (`localhost`). Aún **no tiene acceso de admin** a Supabase, Vercel ni al GitHub de Pablo: los cambios se le entregan como zip a Pablo.

## Entorno de pruebas (ya armado, no volver a preguntar)
- Base de pruebas: Supabase `rebooking-pruebas` (ref `ucwrdmwtlesayjxmlbve`). El `.env.local` de Nico ya apunta ahí. **Nunca** producción.
- Script `scripts/seed-pruebas.mjs` (no va en los zips a Pablo): se niega a correr si la URL no es la de pruebas. `--dry` simula; `--crear-negocio` crea el negocio si el admin no tiene. Re-ejecutable.
- Negocio de pruebas "Estudio Levels (pruebas)", id `0235d97a-6658-4a1c-be69-8c1341ac50ce`, plan **Pro**, 8 profesionales. Si la pantalla muestra "límite de profesionales (3)" o candados PRO, correr en el SQL Editor **de pruebas**: `update tenants set plan='pro', max_professionals=8 where id='0235d97a-6658-4a1c-be69-8c1341ac50ce';`
- Usuarios de prueba: los crea `scripts/seed-pruebas.mjs` (admin, recepción, arriendo y comisión). Correos y PINs en el gestor de claves de Nico, no en el repo.
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


> **Lección (3 oct.): embeds ambiguos en PostgREST.** `inventory_movements` tiene DOS llaves hacia `profiles` (`barber_id` y `approved_by`, migración 016), así que `barber:profiles(name)` daba error y `GET /api/inventario/movements` devolvía lista vacía ("Movimientos recientes" siempre vacío). Se arregló con `barber:profiles!barber_id(name)`. Al pedir un embed, si la tabla tiene más de una llave a la misma tabla, indicar la columna (`!columna`).

> **Cómo dar instrucciones a Nico (regla fija, 3 oct.):** siempre en pasos numerados y completos: en qué ventana (terminal libre `barberia %` vs. la del servidor `npm run dev`), qué botón tocar y dónde está, el texto exacto a pegar en un bloque de código, y qué debe aparecer si salió bien. Nunca dejar "baja la rama y prueba" sin los pasos; para el SQL siempre: `pbcopy < ruta` en la terminal, abrir SQL Editor en Supabase de `rebooking-pruebas`, pegar con `Cmd + V`, **Run**, y qué tabla/filas deben salir. Comando para bajar la rama: `git fetch https://github.com/nicoperezj1/git-estudio-levels claude/hopeful-mayer-jtqlh4 && git checkout -B claude/hopeful-mayer-jtqlh4 FETCH_HEAD`.

## Actualización 3 oct., noche (resumen; el detalle operativo está en `CLAUDE.md` de la raíz)
- Hecho después de la Fase 7: **días para agendar por negocio** (7/14/21/31, `tenants.booking_window_days`, SQL 099, Configuración > Preferencias de reserva; aplicado también en `availability` y `book`); **editar clientes** (`PATCH /api/clients/[id]`, que no existía; menú de 3 puntos en la ficha); selector de clientes del POS y del calendario con celular/correo; avisos al crear cita desde el calendario.
- **Paquete a producción:** `entrega-produccion/` (LEEME-PABLO.md + SQL-PRODUCCION.sql con 086–099 sin 096). Pablo trae la rama de Nico (no hay forma de que Nico suba al repo de Pablo). Remuneraciones oculta hasta probarla.
- El trabajo continúa en Claude Code de escritorio en la Mac de Nico (`~/barberia`). Leer `CLAUDE.md`.
- **Graphify (4 oct.):** el repo `nicoperezj1/git-estudio-levels` ahora tiene como rama por defecto `claude/hopeful-mayer-jtqlh4`, para que el índice en app.graphify.com (workspace `re-booking`) refleje el trabajo actual. Si se vuelve a cambiar la rama por defecto, hay que reindexar.
