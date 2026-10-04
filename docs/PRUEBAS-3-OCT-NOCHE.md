# Pruebas para revisar al volver (3 oct. noche)

Todo está en la rama `claude/hopeful-mayer-jtqlh4`. Antes: traer los cambios, `npm install` y reiniciar el servidor (`rm -rf .next && npm run dev`). No hay SQL nuevo.

## A. Seguridad de rutas (hecho antes; si no lo probaste)
1. Ajuste de comisión (Comisiones) y de arriendo con PIN 3333 → debe funcionar; con un PIN malo → "PIN incorrecto".
2. Mi Billetera como profesional → carga.
3. Agendar una cita → si tienes notificaciones activadas, llega el aviso.
4. Recepción: marcar "llegó" → avisa al profesional.
5. Clientes: abrir ficha, fotos y editar → funciona.

## B. Verificación de totales del POS (modo comparación)
No cambia ningún cobro: solo anota diferencias.
1. Haz 3 ventas normales en el POS (servicio solo, servicio + producto, con descuento por cupón).
2. Haz una venta editando el precio de un ítem a mano.
3. Entra como super admin a **Auditoría** (menú Super Admin) y toca el filtro **"Ventas a revisar"**.
4. Debe aparecer solo la venta del precio editado ("price_edited"). Las normales no deben aparecer.
5. Si aparece alguna normal, mándame la captura: es una diferencia real que hay que entender antes de activar el bloqueo.

## C. Móvil: barra inferior
Abre `localhost:3000/dashboard` en el celular (misma red wifi, usa la IP del Mac, por ejemplo `http://192.168.x.x:3000`) o achica la ventana del navegador a ancho de celular.
1. Abajo aparece una barra con 4 atajos + "Más". Cambian según el rol:
   - Profesional: Mi agenda, Calendario, Clientes, Billetera.
   - Recepción: Calendario, Venta, Clientes, Caja.
   - Admin: Inicio, Calendario, Venta, Clientes.
2. "Más" abre el menú completo de siempre.
3. En Standby (`/dashboard/standby`) la barra **no** aparece.
4. Los botones flotantes (+), los avisos y los mensajes verdes/rojos quedan **por encima** de la barra, sin taparse.
5. En escritorio (ventana ancha) no debe verse nada distinto.
6. Mi Agenda: los botones Confirmar / Iniciar / Completar / WhatsApp se ven más grandes en el celular.

## D. Legal (Ley 21.719)
Todo en `docs/legal/` (ver `README.md`). Lo único que corre en la app es `/privacidad`, que responde 404 hasta activar `LEGAL_PAGES_ENABLED=1`. Para ver el borrador en tu Mac: agrega `LEGAL_PAGES_ENABLED=1` en `.env.local`, reinicia y abre `localhost:3000/privacidad`. Después quítalo.
Lo que más importa leer: `docs/legal/REVISION-TECNICA.md` (13 hallazgos; los #1 PIN sin hash, #2 fotos públicas y #12 RLS abierta son los más serios).

---

# Segunda tanda (4 oct.): avisos, PIN, fotos y consentimiento

Necesita **2 migraciones nuevas** en `rebooking-pruebas` (en este orden): `100_notificaciones.sql` y `101_pin_huella_y_consentimiento.sql`. Ambas son aditivas y se pueden correr dos veces.

## Antes de probar
1. Terminal (no la del servidor): `cd ~/barberia` y traer los cambios con el `fetch` de siempre.
2. `pbcopy < supabase/migrations/100_notificaciones.sql`. Supabase `rebooking-pruebas` → SQL Editor → pegar → Run. Debe salir **3 filas** (`tenants.notification_center_enabled`, `tabla notifications`, `tabla notification_preferences`).
3. `pbcopy < supabase/migrations/101_pin_huella_y_consentimiento.sql`. Pegar → Run. Si el editor solo muestra el último resultado, debe salir **1 fila** `client-photos | false`. Para ver las columnas: `select column_name from information_schema.columns where column_name in ('personal_pin_hash','marketing_consent','marketing_consent_at','do_not_contact');` → **4 filas**.
4. Reiniciar el servidor: Ctrl+C, `rm -rf .next && npm run dev`.

## E. Centro de avisos
1. Entra como **admin** → Configuración → tarjeta **"Avisos y notificaciones"** → marca "Activar el centro de avisos". Debe salir "Avisos activados".
2. Aparece la **campanita** arriba (en el celular, al lado del logo; en escritorio, junto al nombre del negocio) y "Avisos" en el menú.
3. Menú → **Avisos → Enviar aviso**: título "Prueba", mensaje cualquiera, "Todo el equipo", marca "Pedir confirmación" → Enviar. Debe decir "Aviso enviado a N personas" (N = el equipo sin contarte a ti).
4. Entra con otro usuario (por ejemplo recepción David, otra ventana en modo incógnito). La campanita muestra un **1** rojo. Tócala: aparece el aviso. Entra a Avisos y toca **"Entendido"**.
5. Vuelve al admin → Avisos → Enviar aviso → abajo en "Enviados" debe decir "1 de N lo leyeron · 1 confirmaron".
6. Agenda una cita con un profesional (calendario). Ese profesional debe ver en su campanita "Nueva Cita Agendada". Cancela la cita: "Cita cancelada".
7. Como profesional, genera un código de descuento por planilla (Standby): recepción/admin ven "Descuento por planilla por aprobar". Al aprobarlo en Caja, el profesional ve "Se aprobó tu descuento por planilla".
8. Avisos → **Preferencias**: apaga "Nuevas citas", pon horario de silencio y guarda. Agenda otra cita para ese profesional: **no** debe llegarle (los avisos de planilla y del administrador no se pueden apagar).
9. Apaga el interruptor en Configuración: la campanita y "Avisos" desaparecen, y los avisos de nuevas citas siguen llegando como push (como antes).

## F. PIN con huella
1. Cambia el PIN de un profesional (Profesionales → su ficha → PIN) a otro valor y guarda. Con ese PIN nuevo entra a Standby: funciona.
2. Prueba una acción con PIN de admin (descuento manual en el POS con 3333): funciona.
3. Super admin: abre en el navegador `http://localhost:3000/api/superadmin/pin-backfill`. Debe mostrar algo como `{"conPin":8,"sinHuella":7,"conHuellaYValor":1}`.
4. Para completar las huellas, en la consola del navegador (Cmd+Opt+J) pega `fetch('/api/superadmin/pin-backfill',{method:'POST'}).then(r=>r.json()).then(console.log)`. Debe decir `actualizados: 7`. Vuelve a abrir el paso 3: `sinHuella: 0`.
5. Repite 1 y 2: todo sigue funcionando. (El PIN en claro **no** se borra todavía; ver el paso final en `docs/legal/REVISION-TECNICA.md`.)

## G. Fotos de clientes privadas
1. Abre un cliente → sube una foto. Se ve normal.
2. Clic derecho en la foto → "Copiar dirección de la imagen": la dirección debe contener `/object/sign/client-photos/` y un `token=`. Esa dirección **deja de funcionar a la hora**.
3. Super admin: `http://localhost:3000/api/superadmin/photos-migrate` muestra `{"pendientes":N}` (fotos antiguas en el bucket público). Para moverlas, en la consola pega `fetch('/api/superadmin/photos-migrate',{method:'POST'}).then(r=>r.json()).then(console.log)` y repite hasta que `pendientes` sea 0. Las fotos antiguas se siguen viendo.

## H. Consentimiento y "no contactar"
1. Abre `localhost:3000/booking?tenant=levels-pruebas-0xrf`, reserva con un correo nuevo **sin** marcar la casilla de promociones. En Clientes → ese cliente → ⋮ → Modificar datos: "aceptó recibir promociones" debe estar **sin marcar**.
2. Haz otra reserva con otro correo y la casilla **marcada**: debe quedar marcada.
3. En un cliente inactivo marca **"Pidió no ser contactada"** y guarda. Entra a Retención: ese cliente ya no aparece en la lista para escribirle.

## I. Rutas de citas (cerradas)
Crear, mover y cancelar citas en el calendario y Mi Agenda, y abrir el detalle de una cita, deben seguir funcionando igual. Si algo da "No autorizado", mándame captura.
