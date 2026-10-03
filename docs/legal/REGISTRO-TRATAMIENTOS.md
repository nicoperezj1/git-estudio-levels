# Registro de actividades de tratamiento (BORRADOR)

| Tratamiento | Titulares | Datos | Finalidad | Base legal | Quién accede | Dónde | Conservación | Rol re-booking |
|---|---|---|---|---|---|---|---|---|
| Agenda y reservas | Clientes | Nombre, celular, correo, citas | Agendar y recordar | Ejecución de la cita | Negocio (según rol) | Supabase | Define el negocio; sugerido 24 meses sin actividad | Encargado |
| Ficha de cliente | Clientes | Notas, fotos, documentos, etiquetas | Atención y seguimiento | Ejecución; consentimiento si es salud | Admin, recepción, profesional | Supabase + almacenamiento de archivos | Define el negocio; salud según Ley 20.584 | Encargado |
| Ventas y caja | Clientes, equipo | Montos, medio de pago, quién emitió | Cobro y contabilidad | Obligación legal y contrato | Admin, recepción | Supabase | 6 años | Encargado |
| Fidelidad y promociones | Clientes | Puntos, historial, preferencias | Programas de puntos y mensajes | Consentimiento | Admin, recepción | Supabase | Hasta retiro del consentimiento | Encargado |
| Comisiones y arriendo | Equipo | Ventas por profesional, montos | Cálculo de pagos | Contrato | Admin | Supabase | Plazos laborales | Encargado |
| Remuneraciones (si se activa) | Equipo con contrato | RUT, sueldo, AFP, salud, liquidaciones | Emitir liquidaciones | Obligación legal | Admin | Supabase | Normativa laboral y previsional | Encargado |
| Cuentas y accesos | Equipo | Correo, rol, PIN, registro de sesiones | Autenticación y seguridad | Contrato; interés legítimo (seguridad) | Admin; re-booking (soporte) | Supabase | Cuenta activa + 6 meses | Responsable (acceso) / Encargado (datos del equipo) |
| Suscripción y facturación | Dueños de negocios | Nombre, correo, plan, pagos | Cobrar el servicio | Contrato; obligación legal | re-booking | Supabase, Mercado Pago | 6 años | Responsable |
| Notificaciones | Equipo | Token del dispositivo, preferencias | Enviar avisos | Contrato; consentimiento del permiso | re-booking | Supabase, Google/Apple | Hasta cerrar sesión o eliminar cuenta | Responsable |
| Registro de auditoría | Equipo | Acciones realizadas, IP | Seguridad y control | Interés legítimo | Admin, re-booking | Supabase | [12–24] meses | Responsable / Encargado |
