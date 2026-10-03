# Revisión técnica de privacidad (hallazgos en el código, 3 oct. 2026)

Cosas que hay que arreglar o construir para que el sistema respalde lo que dicen los textos. Prioridad: **A** antes del 1 dic.; **B** pronto; **C** con la app.

| # | Hallazgo | Dónde | Por qué importa | Qué hacer | Prio. |
|---|---|---|---|---|---|
| 1 | **PIN personal guardado en texto plano** (`profiles.personal_pin`). También `temp_password` en `profiles`. | migraciones 018, 028 | Principio de seguridad; si se filtra la base, los PIN quedan expuestos. | Guardar el PIN con hash (bcrypt/argon2) y comparar en el servidor; borrar `temp_password` al cambiar la clave. Es un cambio con migración y toca varias rutas (verify-pin, desbloquear, caja, planilla). Hacerlo con un interruptor y probando en pruebas. | A |
| 2 | **Fotos de clientes en un bucket público** (`cut-photos`, URL pública). | `clients/[id]/photos`, migración 023 | Cualquiera con el enlace ve la foto; para salud es dato sensible. | Pasar a bucket privado con enlaces firmados temporales (como ya se hizo con documentos, migración 078). | A |
| 3 | **No hay registro de consentimiento** para promociones/mensajes de retención ni marca "no contactar". | clientes, retención, WhatsApp | La ley exige base legal y poder retirar el consentimiento. | Columnas `marketing_consent`, `marketing_consent_at`, `do_not_contact` + casilla en la reserva online (sin marcar) y filtro en retención. | A |
| 4 | **Aviso de privacidad ausente** en reserva online y registro. | `booking`, `signup` | Deber de informar al titular. | Texto breve + enlace a la política antes de confirmar. | A |
| 5 | **Aceptación de términos y contrato de encargo** no queda registrada. | signup | Para que el contrato valga hay que probar que se aceptó. | Tabla `terms_acceptances` (negocio, usuario, versión, fecha, IP) y pantalla de aceptación al iniciar sesión cuando cambie la versión. | A |
| 6 | **Eliminar/exportar por titular** es incompleto: la exportación es de todos los clientes y la eliminación es masiva; faltan fotos y documentos del cliente. | `clients/export`, `bulk-delete` | Derechos de acceso, portabilidad y supresión. | Endpoints por cliente: exportar (ficha, citas, compras, notas, archivos) y eliminar/anonimizar completo. | B |
| 7 | **Eliminar mi cuenta desde la app** no existe. | — | Exigido por Apple y Google. | Botón en Mi Perfil: solicita eliminación; el admin del negocio aprueba; se anonimiza al usuario. | C |
| 8 | **Retención**: no hay borrado ni anonimización de clientes inactivos ni de registros viejos (auditoría, sesiones). | — | Principio de limitación de conservación. | Parámetro por negocio (meses) + tarea programada que avise o anonimice. | B |
| 9 | **Registro de auditoría** guarda acciones pero no accesos a datos sensibles (quién abrió una ficha clínica). | `audit_log` | Trazabilidad para salud. | Registrar lectura de notas/fotos/documentos de negocios de salud. | B |
| 10 | **Datos de salud (kinesiología)**: no hay marca de dato sensible ni consentimiento clínico. | negocios `business_category = kinesiologia` | Dato sensible: reglas más estrictas. | Casilla de consentimiento por ficha y restricción de quién ve las notas. | B |
| 11 | **Rutas con acceso débil** que ya se cerraron el 3 oct.: avisos push, billetera, ajustes, clientes, fotos. | ver `docs/auditoria-rutas-api.md` | Acceso indebido a datos personales. | Hecho. Siguen `mercadopago*`, `tuu*`, `pos/checkout`. | A |
| 12 | **Políticas RLS abiertas** (`USING (true)`) en muchas tablas: un usuario con sesión podría leer datos de otros negocios si habla directo con Supabase. | migraciones 001–057 | Aislamiento entre negocios. | Migración de RLS por `tenant_id` (la más grande de las pendientes; ver `docs/ESTADO-Y-PENDIENTES.md`). | A |
| 13 | **Registros y avisos**: los correos de boleta y recordatorio incluyen datos del cliente. | `resend.ts` | Minimizar datos. | Revisar contenido y proveedor; ya se limita lo que sale en avisos push. | C |

Nota: lo que diga la Política de Privacidad debe ser verdad el día que se publique. Los puntos 1 a 5 y 12 son los que más lo condicionan.
