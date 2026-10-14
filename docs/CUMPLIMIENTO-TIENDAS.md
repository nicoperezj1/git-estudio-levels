# Cumplimiento Google Play y App Store (re-booking), 14 oct. 2026

Objetivo: no volver a recibir rechazos. Cada punto dice qué declaramos, qué hace la app de verdad y si coincide.

## 1. Lo que la app hace de verdad (fuente: código)
- Agenda, caja/POS, clientes (nombre, teléfono, correo, notas, fotos), equipo, comisiones, boletas, reservas online.
- Documentos PDF/Word por cliente (`/api/clients/[id]/documents`): existe, se activa por negocio (`tenants.client_files_enabled`). **Puede contener recetas y exámenes.**
- Fotos de clientes (bucket privado `client-photos`).
- No tiene campos clínicos propios (diagnósticos, fichas). Las notas son texto libre.
- Cuentas: las crea cada negocio; no hay registro público en la app. Eliminar cuenta: Mi Perfil y `/eliminar-cuenta`.
- Suscripción: se paga fuera de la app (Mercado Pago, www.re-booking.cl). La app solo muestra el plan, sin botón de pago.
- Avisos push (FCM/APNs), Face ID, correo (Resend).

## 2. Google Play
| Tema | Declarado | Coincide | Riesgo |
|---|---|---|---|
| Tipo de cuenta | Personal | NO para salud | **Rechazado el 13 oct.** Las apps de salud exigen cuenta de organización |
| Salud | Gestión y servicios sanitarios, fisioterapia | Sí, por los documentos médicos | Con cuenta org es válido, hay que mantenerlo |
| Funciones financieras | No | Sí (no presta ni mueve dinero) | Bajo |
| Anuncios | No | Sí | Bajo |
| Audiencia | 18+ | Sí | Bajo |
| Seguridad de los datos | 11 tipos, cifrado en tránsito, borrado de cuenta | Revisar contra datos de salud | Medio: agregar "información de salud" si se mantienen documentos |
| Política de privacidad | https://www.re-booking.cl/privacidad | Parcial: sin revisión de abogado | Medio |
| Cuenta demo | Cargada | Sí | Verificar que siga funcionando antes de cada envío |

Acciones para la cuenta de organización (D-U-N-S pedido el 13 oct.):
1. Crear cuenta org con RE-BOOKING SpA (RUT 78.511.911-8), correo contactorebooking@gmail.com, US$25, teléfono Android real, sitio verificado.
2. Pedir transferencia de la app `cl.rebooking.app` a Play Developer Support (las pruebas no se transfieren).
3. Rehacer: declaración de salud completa y honesta, seguridad de los datos con datos de salud, prueba cerrada o confirmar si org está exenta de 12 testers x 14 días.
4. Antes de enviar: política con abogado, o al menos texto consistente con los documentos.

## 3. App Store (Apple)
| Tema | Estado | Riesgo |
|---|---|---|
| Cuenta | Personal (Nico), vendedor aparece como persona | Medio: apps de rubros regulados (salud) deberían enviarse como entidad legal (guía 5.1.1, ix) |
| Datos declarados | 8 tipos, vinculados al usuario, sin seguimiento | Revisar si se agregan datos de salud |
| Política de privacidad | https://www.re-booking.cl/privacidad | Medio |
| Eliminar cuenta | Existe (guía 5.1.1 v) | Bajo |
| Pagos | Fuera de la app, sin enlaces de compra | Medio: el revisor puede objetar la pantalla de plan |
| Cuenta demo y teléfono | Teléfono cargado; **usuario y clave los pone Nico** | Alto si falta o falla |
| DSA (Europa) | Solo Chile, así que no aplica por ahora | Bajo |
| Contrato Apple actualizado | Lo acepta el titular | Alto: bloquea el envío |
| Capturas | 5 de 1206x2622 (reescaladas de Android) | Bajo, mejor hacerlas desde iPhone |

Acciones:
1. Nico: usuario y clave demo, aceptar el contrato.
2. Decidir si se envía con cuenta personal (riesgo de que pidan entidad legal por salud) o se espera la org. Con el D-U-N-S también se puede pasar Apple a organización.
3. Antes de enviar: revisar que el texto de la ficha no prometa funciones clínicas.

## 4. Datos de salud (decisión pendiente de abogado)
- Hoy los documentos médicos pueden subirse. La política dice que se trata solo con consentimiento y que re-booking no es ficha clínica certificada.
- Ley 21.719 rige desde el 1 dic. 2026. Antes de esa fecha: abogado, consentimiento explícito del paciente, plazo de conservación y canal de derechos.
- Rama guardada `entrega-sin-documentos`: apaga documentos para todos y ajusta la política. Se usa solo si se vuelve al camino de cuenta personal.

## 5. Antes de cada envío a una tienda
1. La ficha, la política y las declaraciones dicen lo mismo.
2. La cuenta demo entra y muestra datos.
3. "Eliminar mi cuenta" funciona.
4. No hay botones de pago ni enlaces para suscribirse dentro de la app.
5. La política de privacidad responde en su URL pública.
