# Pruebas: seguimiento de publicidad (nivel 1, migración 110)

Sirve para **todos los negocios**: todo va por negocio y viene **apagado por defecto**. Probar primero en Supabase `rebooking-pruebas` (`ucwrdmwtlesayjxmlbve`).

## 1. SQL (Supabase de pruebas → SQL Editor)
1. Abrir `supabase/migrations/110_seguimiento_de_publicidad.sql`, copiar todo, pegarlo y ejecutar.
2. Debe salir una tabla de **3 filas**: `appointments.ad_attribution`, `clients.first_ad_attribution`, `tenants.ad_tracking_enabled`.
3. Se puede ejecutar más de una vez sin problema.

## 2. Activar en el negocio de pruebas
1. En `localhost:3000`, entrar como administrador de "Estudio Levels (pruebas)".
2. Configuración → tarjeta **Publicidad** → **Abrir**.
3. Marcar **Guardar el origen de las reservas**. Debe salir "Seguimiento de publicidad activado".

## 3. Generar el link
1. En la misma pantalla, bajar a **Generar link con etiquetas**. Elegir "Anuncio pagado", campaña `agenda barberos octubre`, anuncio `reel prueba`.
2. Debe salir un link como `…/b/levels-pruebas-0xrf?utm_source=meta&utm_medium=paid&utm_campaign=agenda-barberos-octubre&utm_content=reel-prueba`. Copiarlo.

## 4. Reservar con ese link
1. Abrir el link en una **ventana de incógnito** (así no hay sesión).
2. Verificar que la barra de direcciones pasa a `/booking?tenant=…&utm_source=meta…` (los parámetros **no se pierden**).
3. Hacer una reserva completa con un cliente nuevo (nombre y correo de prueba).
4. En el panel: Publicidad → **Reservas por campaña**. Debe aparecer `agenda-barberos-octubre` con 1 reserva y 1 cliente nuevo.
5. Reservar de nuevo con el link **sin** etiquetas (`/b/levels-pruebas-0xrf`): debe sumar a "sin etiqueta", no a una campaña.

## 5. Apagado
1. Apagar el interruptor y repetir la reserva con link etiquetado: la reserva se crea normal pero **no** aparece en el reporte.

## Qué NO cubre todavía
- Reservas con **abono por Mercado Pago**: no guardan el origen (el dato no viaja en la referencia del pago). Pendiente del nivel 2.
- Gasto de Meta, costo por cliente y retorno: nivel 2. Píxel y API de Conversiones: nivel 3.
- Para anuncios de Meta, pegar en «Parámetros de URL» del anuncio lo que muestra la pantalla Publicidad. Los anuncios que van a WhatsApp o al perfil de Instagram no llegan a la reserva y no se miden aquí.

## Pruebas automáticas
```
npx tsx scripts/test-ad-tracking.ts
```
Debe terminar en `TODO OK`.
