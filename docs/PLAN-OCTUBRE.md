# Plan de octubre 2026: re-booking

Plan acordado con Nicolás el 3 de octubre de 2026. Ordena todos los pedidos de octubre en fases. Cada fase se entrega a Pablo como un paquete (parche + SQL + LEEME con pruebas y plan de vuelta atrás).

**Regla número uno: nada puede afectar para mal a producción.** Todo lo que toque datos o dinero se apunta con su plan de vuelta atrás.

---

## 0. Reglas para todas las fases

1. **Partir siempre de producción.** Antes de empezar una fase, comparar con `pdencina/barberia` rama `main` y traer lo nuevo (ver `docs/CONTEXTO.md`).
2. **Probar antes de publicar.** Ideal: un sitio de prueba en Vercel conectado al Supabase `rebooking-pruebas` (pedido a Pablo, pendiente). Si no existe, cada función nueva va **apagada por defecto** y se prueba primero solo en Estudio Levels.
3. **Migraciones solo aditivas y re-ejecutables** (`IF NOT EXISTS`). Nunca borrar ni cambiar datos existentes. Numeración desde la **089** (la 088 ya existe en la rama).
4. **Respaldo antes de cada SQL:** Pablo exporta la base antes de correr una migración.
5. **Cada LEEME trae:** pasos, pruebas, y **"Si algo falla"** con: qué revertir (`git revert`), cómo apagar la función y el SQL para deshacerla.
6. **Seguridad junto al cambio:** si una fase toca una ruta que el informe `docs/auditoria-rutas-api.md` marca como abierta, se protege en la misma fase (sesión, negocio y rol).
7. `npx tsc --noEmit` sin errores antes de cada commit.

---

## 1. Decisiones ya tomadas con Nicolás

| Tema | Decisión |
|---|---|
| Comisión por venta de productos | Cada negocio elige % o monto fijo. Es **fija para todo el negocio** (no por profesional). Se define en cada producto del inventario. |
| Productos vendidos por un profesional | **No suman** a su producción del mes; solo generan su comisión. |
| Propina | Al cobrar se sugiere **10%**, con opción de escribir otro monto. Va **100% al profesional que atendió** y suma a sus métricas. Se le paga **a fin de mes**. Queda prevista (apagada) una opción para negocios que reparten propinas. No va dentro de la boleta del servicio. |
| Movimientos de meses anteriores | Se pueden registrar estando en el mes siguiente ("Corresponde al mes"). El cierre mensual se puede cerrar y **reabrir**. |
| "Emitido por" | Se guarda desde ahora; los movimientos antiguos quedan sin ese dato. |
| Descuento sobre el 15% (trabajadores con contrato) | Se permite, con ventana de confirmación que explica el límite legal (art. 58 Código del Trabajo). El negocio decide. |
| Vacaciones de profesionales | **Solo bloquean horas** (agenda y reserva online). |
| Gastos del mes | Se ingresan **desde cero cada mes** (no se copian solos). |
| Comisión de la máquina | **Manual**, cada mes. Al lado se muestra lo vendido ese mes con débito y con crédito como ayuda. |
| Reducción de efectivo | Tope **por sucursal** (si hay una sola, por negocio). |
| Campos que se ocultan en la ficha | **Solo para recepcionistas:** link de agenda, duración de slot, modalidad, comisión, horario, servicios y presentación. |
| Remuneraciones | Impuesto único **calculado solo**, con corrección manual. |
| Recibos | **PDF** (no HTML), con logo del negocio. Verde lo que suma al profesional, rojo lo que descuenta. Para liquidaciones de sueldo, Arriendo y Comisión. |
| "Cita completada" | Se completa al cobrar (ya hecho en el parche `0013`, falta en producción). |

---

## 2. Fase 0: base (pequeña)

- Pablo aplica el parche **`0013`** ("Nuevo" = primera cita; el cobro completa la cita).
- Pedir a Pablo el **sitio de prueba** en Vercel conectado a `rebooking-pruebas`.
- Revisar con Pablo las entregas de seguridad de la carpeta `entregas/` contra su `main` antes de aplicarlas.

**Riesgo:** bajo. **Vuelta atrás:** `git revert` del commit del `0013`; no tiene SQL.

---

## 3. Fase 1: arreglos rápidos (bajo riesgo)

> **Estado (3 oct., madrugada):** Fases 1 a 7 COMPLETAS EN CÓDIGO (la 5, 6 y 7 sin probar). Fase 2 y Fase 4 probadas y cerradas por Nico (único pendiente de Fase 4: el correo de solicitud de insumos no llega; Resend lo acepta, hay que revisar con Pablo el registro Emails de Resend, dominio verificado y spam). Pendientes de probar en pantalla: Fase 1 (parte) y Fase 3. Siguiente: Fase 5 (riesgo ALTO). Detalle en `docs/CONTEXTO.md`.

| Cambio | Detalle |
|---|---|
| **Métricas de clientes (error)** | La consulta solo lee los primeros 1.000 clientes (límite de Supabase), que son los importados; los nuevos nunca se cuentan. Contar por origen en la base, sin límite, y separar "registro anterior" de clientes nuevos. |
| Cómo nos conoció | Agregar "Referido de un amigo/conocido" y "Facebook". Mostrar el campo también al crear cliente **desde el POS**. Cuenta en métricas. |
| Mi Agenda | El administrador que atiende sale **primero y ya seleccionado**. |
| Orden de servicios | Arrastrar para ordenar en Servicios; la página pública de reservas respeta ese orden (`services.sort_order` ya existe). Proteger `/api/services/reorder` (hoy sin sesión). |
| Recepcionista | Campo **"Nombre de encargado"** para el saludo "Hola David" en Caja y POS. Ocultar los campos que no le aplican (ver decisiones). |
| Calendario en celular | Un toque abre **"Agendar / Bloquear"**. "Atrás" en Android y tocar fuera **solo cierran** el cuadro. Líneas de hora sutiles (baja opacidad) en la grilla. |
| Calendario 7 días con varios profesionales | Permitir **agendar con un clic** (hoy esa vista es solo de lectura). |
| Fidelidad configurable | Cada negocio define puntos por cada $ y recompensas (ej. 100 o 200 puntos). Corregir el error: hoy, al cobrar, los puntos usan la configuración de **otro negocio** (falta filtrar por negocio). Proteger `loyalty/earn` y `loyalty/redeem`. |

**SQL:** probablemente `089` (nombre de encargado en `profiles`, nuevos orígenes si son lista cerrada). **Riesgo:** bajo; son pantallas y una consulta. **Vuelta atrás:** `git revert`; las columnas nuevas pueden quedar.

---

## 4. Fase 2: finanzas (base de todo lo demás)

| Cambio | Detalle |
|---|---|
| Fecha contable | Campo **"Corresponde al mes"** en cada ingreso y egreso (por defecto, el mes de hoy). Arregla que un egreso de septiembre registrado en octubre no salga en el cierre de septiembre. |
| Emitido por | Guardar quién registra cada movimiento. |
| Ingresos y Egresos | Columnas: fecha, hora, tipo, descripción, profesional / corresponde a, emitido por, cliente, método de pago, monto. Filtros y exportación. Todo lo demás se mantiene. |
| Gastos del mes | Sección en el cierre mensual: impuestos, comisión máquina (con ayuda débito/crédito), arriendo/dividendo, insumos, luz, publicidad, honorarios/freelance, equipamiento. Se ingresan cada mes y se ven en egresos, cierre e informes. |
| Cierre mensual e informes | Leen la **fecha contable**. Botón **"Cerrar mes"** / **"Reabrir"** (solo admin), con registro de cambios. |

**SQL:** `090` (columnas `accounting_month` y `created_by` en movimientos, tabla de gastos del mes, tabla de meses cerrados). Los movimientos existentes quedan con fecha contable = su fecha de creación (no se cambian datos). **Riesgo: ALTO** (toca el dinero de los informes).

**Vuelta atrás:**
- Las columnas nuevas no cambian datos viejos; si el código falla, `git revert` y los informes vuelven a calcular como antes.
- Antes de publicar: comparar el cierre de septiembre **antes y después** del cambio en el sitio de prueba; solo deben aparecer de más los egresos marcados para septiembre.

---

## 5. Fase 3: libro de movimientos del profesional

Una sola tabla de movimientos por profesional y mes. Arriendo, Comisión y Remuneraciones la leen con la misma regla de signos:

| Movimiento | Arriendo (el profesional paga) | Comisión (el negocio paga) |
|---|---|---|
| Base (arriendo diario/mensual o comisión de servicios) | + debe pagar | + a pagar |
| Dinero a su favor cobrado por el negocio | − | + |
| Propinas | − (a su favor) | + |
| Comisión por venta de productos | − | + |
| Consumibles | + | − |
| Descuento por planilla | + | − |
| Descuento / quincena | — | − |
| Movimiento manual ("Agregar movimiento") | según elija el admin, con motivo | ídem |

Además:
- **Propina en el POS** también para efectivo, con sugerencia del 10%.
- **"Comisión por venta"** en cada producto del inventario.
- Arriendo y Comisión se recalculan desde el libro; se puede **editar lo "cobrado"** con registro de quién lo cambió.
- **Recibo PDF** por profesional y mes, con logo y colores verde/rojo.

**SQL:** `091` (tabla del libro, comisión por producto, propina por profesional). **Riesgo: ALTO** (cambia cuánto se le paga a cada profesional).

**Vuelta atrás:**
- Interruptor por negocio: si se apaga, Arriendo y Comisión calculan **como hoy**.
- Antes de encenderlo: comparar septiembre calculado a la manera antigua y con el libro, profesional por profesional, en el sitio de prueba.

---

## 6. Fase 4: inventario y compras

| Cambio | Detalle |
|---|---|
| Tipo de producto | **Venta** (aparece en POS y Standby) o **Insumo**. Categorías: cosméticos, aseo, consumibles, generales y "+ categoría". |
| Solicitud (recepción) | Lista de insumos con existencia actual y cantidad a comprar, más "otro producto" y la fecha. Se envía por **correo** al email que elija el admin y queda en el Dashboard hasta borrarla a mano. |
| Proveedores (Mi negocio) | Nombre y celular manuales, productos del inventario con cantidad y "¿producto nuevo?". Mensaje de WhatsApp automático con saludo según la hora (buenos días / tardes / noches), nombre del admin y del negocio. |

**SQL:** `092` (tipo y categoría de producto, solicitudes, proveedores). **Riesgo:** medio (el POS filtra por tipo: por defecto todo producto existente queda como **Venta**, así nada desaparece del POS). **Vuelta atrás:** `git revert`; tablas nuevas pueden quedar.

---

## 6b. Fase 4b (adelantada): cupos por bloque — solo Kinesiología
Pedido de un negocio real (Espacio Integral): atender a 2 clientes a la vez por profesional. **SQL `093`** (`tenants.max_clients_per_slot`, default 1). Solo se puede activar si `business_category = kinesiologia`; en cualquier otro rubro el cupo es siempre 1 (como hoy). Configuración > "Clientes por bloque" (1 a 6). Un horario se bloquea solo cuando ya hay tantas citas a la vez como cupos (`src/lib/capacity.ts`): disponibilidad pública, agendado público y agendado desde el calendario (con segunda verificación al guardar). El link de reserva muestra "N cupos"; el calendario pone las citas simultáneas lado a lado. Cobro y comisión no cambian (cada cliente es una cita). **Probada por Nico en pruebas (3 oct.): agendar 2 por bloque desde link y calendario 1/3/7 días, cupos en rojo, hora correcta.** También: un clic en el calendario abre Agendar/Bloquear; la hora se guarda igual en cualquier servidor (`src/lib/wallclock.ts`); mover una cita respeta el cupo. **Riesgo:** bajo (default 1 = idéntico a hoy), pero toca el agendado. Las migraciones siguientes se corrieron un número: Fase 5 = `094`, Fase 6 = `095`, Fase 7 = `096`.

## 7. Fase 5: Standby y caja

| Cambio | Detalle |
|---|---|
| Standby igual al POS | "Hola [profesional]", con sus servicios y los productos de venta. |
| Reportar problema | Nota libre (ej. "faltan $10.000") que le llega al admin. |
| Reducción de efectivo | El admin define el tope por sucursal. Al superarlo: "Haz una reducción de $X y déjalo en la caja fuerte", con **Confirmar** o **Reportar problema**. Se registra como retiro para que la caja cuadre. |
| Descuento por planilla | El profesional elige el producto y se genera un **código**. Recepción o admin lo ingresa para aprobar; recién ahí se descuenta el stock y se anota en el libro. Si es trabajador con contrato y supera el 15%, aviso de confirmación. |
| Apagar caja (recepción) | Oculta montos y acciones; se vuelve a encender con el **PIN de la recepcionista**. Distinto de cerrar caja. |

**SQL:** `094` (reportes, retiros de efectivo, códigos de planilla, tope por sucursal). **Riesgo: ALTO** (toca cobros). Proteger en esta fase `pos/checkout`, `pos/verify-pin`, `caja/reopen`. **Vuelta atrás:** interruptor por negocio para el Standby nuevo (si se apaga, queda el actual); `git revert` del resto.

---

## 8. Fase 6: Mi negocio y reservas

| Cambio | Detalle |
|---|---|
| Menú "Mi negocio" (admin) | Vacaciones de profesionales, Comisiones, Arriendo, Servicios, Proveedores, Remuneraciones. |
| Vacaciones | Rango de fechas por profesional; bloquea la agenda y la reserva online. |
| Primer profesional disponible | En Configuración > Preferencias de reserva, el admin elige **una** de 3 reglas (ver abajo). Lo que hace hoy el botón queda como valor por defecto. |

**Las 3 reglas de "primer profesional disponible":**
1. **Menos agenda en el día:** entre los que tienen la hora libre, el con menos citas ese día.
2. **Primera hora según la búsqueda del cliente:** el profesional con la hora disponible más cercana; si empatan, ganan los **prioritarios** (lista para elegir uno o más).
3. **Mayor % para profesionales elegidos:** uno o varios profesionales con su %, editable (suma máxima 100%; el resto se reparte entre los demás). Se cuenta **por semana**. Cada reserva automática va al que está más lejos de su meta, si tiene la hora libre.
   - Botón **"Recomendado por estadísticas":** propone % según las ventas de servicios del **mes anterior**, potenciando al que vendió menos (mínimo 10%, máximo 60% por profesional; uno nuevo recibe el promedio). Solo rellena los campos; el admin decide.
   - **Tarjeta en el Dashboard** (admin): cumplimiento semanal ("Pedro 48% / meta 50%"), cuántas reservas automáticas hubo, y aviso de nueva recomendación al empezar el mes.

Para las tres: solo cuentan profesionales que hacen el servicio, trabajan ese día, tienen la hora libre y no están bloqueados ni de vacaciones. Si el elegido no puede, pasa al siguiente; nunca se pierde la reserva.

**SQL:** `095` (vacaciones, regla elegida, % por profesional). **Riesgo:** medio (toca la reserva pública). **Vuelta atrás:** la regla por defecto es la actual; volver a ella en Preferencias deja todo como hoy.

---

## 9. Fase 7: Remuneraciones

Basado en la plantilla Excel de Nicolás (`Plantilla_Liquidacion_Sueldo_Chile.xlsx`). Solo para trabajadores **con contrato**.

**Corrige estos errores de la plantilla:**
1. Los aportes del empleador (SIS, AFC empleador, Mutual) no usaban tope.
2. La marca "Tributable" no se usaba; el impuesto se escribía a mano.
3. Días trabajados, licencias, horas semanales y gratificación automática no se usaban; el sueldo no se ajustaba por ausencias.
4. La hoja de comisiones no estaba conectada a la liquidación.
5. "Plan salud adicional" en realidad es el total del plan de Isapre.
6. No validaba sueldo mínimo ni el tope del 15% de descuentos.
7. Faltaba el aporte del empleador de la reforma de pensiones (Ley 21.735).

**Diseño:**
- **Ficha laboral:** contrato, fecha de ingreso, jornada, sueldo base, AFP y tasa, Fonasa/Isapre (plan en UF), colación, movilización.
- **Parámetros del mes editables** (nunca fijos en el código): UF, UTM, sueldo mínimo, topes, tasas (AFP, SIS, AFC, Mutual, reforma) y tramos del impuesto único. El super admin puede cargarlos una vez y los negocios los heredan.
- **Liquidación:** sueldo proporcional a días trabajados; comisiones desde el libro de movimientos; semana corrida sugerida; gratificación (25% con tope 4,75 sueldos mínimos al año, o manual); propinas aparte; quincena = anticipo; descuento por planilla = otros descuentos autorizados; impuesto calculado y editable; topes bien aplicados.
- **Revisiones:** sueldo ≥ mínimo proporcional; aviso si descuentos > 15%; líquido > 0; parámetros del mes cargados.
- **Resultado:** PDF de liquidación con logo; costo empresa; el líquido entra como egreso "Remuneraciones" en el cierre.
- **Guía al lado:** parámetros desde Previred → asistencia y licencias → comisiones y semana corrida → descuentos → emitir y pagar → cotizaciones en Previred dentro del plazo → Libro de Remuneraciones Electrónico si corresponde → guardar firmas. Aviso: "Herramienta de apoyo; valida con tu contador".

**SQL:** `096` (ficha laboral, parámetros del mes, liquidaciones). **Riesgo:** medio (no cambia nada existente; es un módulo nuevo). **Vuelta atrás:** `git revert`; tablas nuevas pueden quedar sin uso.

---

## 10. Pendientes fuera de estas fases

- Resto de rutas abiertas del informe de seguridad que no se toquen en ninguna fase (ver `docs/auditoria-rutas-api.md`).
- Actualizar Next.js 14.1.3 (advertencia de seguridad), después de las fases de dinero.
- Pixel de Meta por negocio (conversado, sin fecha).
- Limitar las columnas de `GET /api/barberos/[id]` (hoy devuelve el PIN a quien tiene acceso).

## Paquete a producción (3 oct.)
Carpeta `entrega-produccion/` (LEEME-PABLO.md + SQL-PRODUCCION.sql = migraciones 086–099 sin la 096). Remuneraciones (Fase 7) queda **guardada pero oculta** (menú solo super_admin, SQL 096 aparte) hasta probarla con Nico: pendiente correr 096, cargar parámetros Previred/SII y comparar septiembre con su Excel.
