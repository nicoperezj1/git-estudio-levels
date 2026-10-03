# Pruebas de las Fases 5, 6 y 7 (y cupos por bloque)

Todo está hecho en código y compila (`tsc`); la lógica de cálculo se probó con scripts, pero **nada se probó todavía en pantalla**.
Probar SOLO en `rebooking-pruebas`. Antes de cada SQL: respaldo (en pruebas no hace falta, en producción sí).

## Orden de los SQL (todos aditivos y re-ejecutables, cada uno termina con una consulta de verificación)
1. `093_cupos_por_bloque.sql` (ya corrida en pruebas)
2. `094_standby_caja.sql` — debe devolver 3 filas
3. `095_mi_negocio_reservas.sql` — debe devolver 2 filas
4. `096_remuneraciones.sql` — debe devolver 3 filas

(También deben estar 089 a 092; en pruebas ya están.)

## Fase 5 — Standby y caja
1. Configuración > **Caja y Standby**: activar "Standby nuevo" y poner un tope bajo (ej. 20.000).
2. Standby: ingresar con PIN 2222. Debe verse como el Punto de Venta (servicios y productos, cliente, cupón, descuento, pago dividido) con "Hola, Camila", solo SUS servicios, y arriba "En caja", Reportar problema, Descuento por planilla y Cerrar sesión. Cobrar con un cliente y revisar que la venta aparece en Ingresos/Egresos, Caja y Métricas; con tarjeta NO se activa la máquina.
3. Cobrar en efectivo hasta pasar el tope: sale "Haz una reducción de $X…". **Confirmar**; en Caja el "Esperado" baja y aparece el aviso de retiro.
4. Repetir con **Reportar problema** (en esa pantalla y desde el botón de abajo): debe aparecer en el Dashboard (tarjeta "Problemas reportados").
5. En Standby: **Descuento por planilla** → elegir producto → sale un código de 6 caracteres. En **Caja > Descuento por planilla** ingresar el código: baja el stock y queda en el libro del profesional (Comisiones/Arriendo, tipo "Descuento por planilla").
6. Caja > **Apagar caja**: se oculta todo; se enciende con el PIN de recepción (1234).
7. Apagar "Standby nuevo": vuelve el Standby de siempre.
8. Seguridad: sin sesión, `/api/pos/checkout`, `/api/pos/verify-pin`, `/api/caja/reopen` responden 401.

## Fase 6 — Mi negocio y reservas
1. Menú **Mi negocio**: Vacaciones, Comisiones, Arriendo, Servicios, Proveedores, Remuneraciones.
2. **Vacaciones**: agregar a un profesional unos días; en el link de reserva ese profesional no tiene horas ni esos días en el selector; en el Calendario esos días salen bloqueados ("Vacaciones").
3. Configuración > **Preferencias de reserva**: probar las 3 reglas con "Primer profesional disponible" (link de reserva, y vista por horario cuando hay 2+ profesionales a la misma hora).
   - Regla 3: poner % distintos y reservar varias veces; ver la tarjeta "Reservas automáticas" del Dashboard. Probar "Recomendado por estadísticas".

## Fase 7 — Remuneraciones
1. Mi negocio > **Remuneraciones** > Fichas laborales: crear la ficha de un profesional.
2. **Parámetros del mes**: cargar los valores de Previred / SII (UF, UTM, sueldo mínimo, topes, tasas, tramos del impuesto). El sistema no inventa ninguno.
3. **Liquidaciones**: preparar septiembre de ese trabajador; **comparar contra el Excel** (esta plantilla no estaba en el repo: mandarla para cotejar).
4. Emitir → bajar el PDF → Marcar como pagada → ver el egreso "Remuneraciones" en Ingresos/Egresos.

## Cupos por bloque (ya probado) y orden de servicios (ya probado)
Sin cambios pendientes.

## Qué NO está cubierto
- Recálculo de totales en el servidor y verificación del pago de Mercado Pago en `pos/checkout`.
- Libro de Remuneraciones Electrónico y archivo Previred (solo la guía).
- El correo de "Solicitud de insumos" (revisar Resend con Pablo).
