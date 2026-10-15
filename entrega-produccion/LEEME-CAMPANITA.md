# Campanita de avisos en produccion

El codigo ya esta en `main` (notify.ts, notification-bell.tsx, pagina Avisos). Si no aparece la campanita, es una de dos cosas:

## Como saber cual es (1 minuto, sin tocar nada)
1. Entrar a producción como **administrador**. Ir a **Configuración** y buscar la tarjeta **"Avisos y notificaciones"**.
2. Si dice en rojo **"Falta aplicar la migración 100 en la base de datos"**: falta el SQL (paso A).
3. Si no dice nada y la casilla "Activar el centro de avisos" está desmarcada: solo falta activarla (paso B).

## A. Aplicar la migración 100 (solo si faltaba)
1. Abrir Supabase de **producción** (`ulucmbuvupulwplsrcnx`) > SQL Editor.
2. Correr la consulta del paso 1 de `entrega-produccion/SQL-CAMPANITA.sql`. Si no devuelve filas con migración `100`, saltar al paso B.
3. Si devuelve filas `100`: pegar y ejecutar `supabase/migrations/100_notificaciones.sql` completo. Debe devolver **3 filas** al final.
4. Es aditiva: no cambia ni borra datos. Todo queda apagado.

## B. Activar el interruptor por negocio
Configuración > Avisos y notificaciones > marcar "Activar el centro de avisos". Cada negocio lo hace por su cuenta. Apagado, todo sigue como antes (las citas nuevas siguen llegando como notificación del teléfono).

## ¿Hace falta la 101?
No para la campanita. La 101 agrega la huella del PIN personal, el consentimiento de promociones de clientes y el bucket privado `client-photos`. Según los registros ya se aplicó en producción el 12 oct.; la consulta del paso 1 lo confirma.

## Dónde se ve la campanita
- Computador: junto al nombre del negocio en el menú lateral (**no se ve con el menú contraído**).
- Celular: arriba a la derecha, siempre.
- La página completa está en Avisos del menú.
