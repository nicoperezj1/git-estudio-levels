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
