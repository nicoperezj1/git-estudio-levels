# Publicar la app de re-booking en App Store y Google Play

Estado al 6 oct. 2026. Pasos numerados; lo que dice **(tú)** no lo puede hacer Claude (pagos, cuentas, contraseñas).

## 1. Qué ya está hecho
- App con **Capacitor** (iPhone y Android) en la rama `app/capacitor-base`. Carga `https://www.re-booking.cl` y parte en el login (sin landing ni registro).
- Identificador `cl.rebooking.app`, nombre `re-booking`, icono (la "B" con flecha) para iPhone y Android.
- Probada en el simulador de iPhone (login, barra inferior, calendario, clientes, caja, mi agenda).
- **Android compila y está firmado:** `app-tiendas/re-booking-android-1.0.aab` (en tu carpeta `~/barberia`). Es el archivo que se sube a Google Play.
- Botón **Eliminar mi cuenta** (Mi Perfil) y página pública `/eliminar-cuenta`, que Apple y Google exigen.
- La llave de firma de Android está en `~/Library/re-booking-keys/` (fuera del proyecto). **Haz una copia en un lugar seguro (tú):** sin ella no se pueden subir versiones nuevas con el mismo registro. Google Play permite recuperarla con soporte si activas "Play App Signing" (se activa solo al crear la app).

## 2. Qué falta ANTES de pagar (se puede hacer ya)
1. **Llevar el código a producción.** La app carga la web de producción; hoy producción NO tiene el redireccionamiento a login, el botón de eliminar cuenta ni las mejoras móviles. Hay que armar el paquete, probarlo y mergearlo (lo prepara Claude; el merge es tuyo).
2. **Política de privacidad pública.** Hoy está oculta (`NEXT_PUBLIC_LEGAL_PAGES_ENABLED`). Los borradores en `docs/legal/` los debe revisar un abogado. Las tiendas piden la dirección (URL) de la política.
3. **Correo de soporte** (tú): define uno (por ejemplo `soporte@re-booking.cl`) y ponlo en Vercel como `NEXT_PUBLIC_SUPPORT_EMAIL`. Aparece en `/eliminar-cuenta`.
4. **Cuenta de demostración** (tú): un negocio de prueba con un usuario administrador y datos de ejemplo, para que los revisores de Apple y Google puedan entrar. Su correo y clave van en el formulario de revisión (no en el repositorio).
5. **Decidir a nombre de quién** quedan las apps: la empresa dueña de re-booking, no Estudio Levels.

## 3. Cuentas (tú) — aquí es donde se paga
| Tienda | Costo | Qué necesitas |
|---|---|---|
| Apple Developer Program | USD 99 al año | Cuenta de **organización**: empresa y número **D-U-N-S** (gratis, puede tardar semanas). Se pide en developer.apple.com/enroll |
| Google Play Console | USD 25, una vez | Cuenta de **organización** (evita la exigencia de 12 testers por 14 días de las cuentas personales). Se abre en play.google.com/console |

Claude no puede pagar ni ingresar datos de tarjeta ni documentos de la empresa.

## 4. Google Play (Android)
1. En Play Console: **Crear app** → nombre `re-booking`, idioma español (Chile), tipo "App", gratuita.
2. **Política de privacidad:** pega la dirección pública. **Eliminar cuenta:** pega `https://www.re-booking.cl/eliminar-cuenta`.
3. **Seguridad de los datos:** declara los datos que maneja (nombre, correo, teléfono, citas, ventas); se cifran en tránsito; la persona puede pedir su eliminación.
4. Producción o prueba interna → **Crear versión** → sube `re-booking-android-1.0.aab`. Acepta "Play App Signing".
5. Completa ficha (textos abajo), capturas (mínimo 2 de teléfono) y clasificación de contenido (cuestionario).
6. Envía a revisión (suele tardar de 1 a 7 días).

## 5. App Store (iPhone)
0. **Antes de archivar**, en la carpeta del proyecto: `npx cap sync ios` (SIN la variable `CAP_SERVER_URL`), para que la app apunte a producción y no a `localhost`. La app es solo para iPhone.
1. Con la cuenta aprobada, en **Xcode → Settings → Accounts** agrega la cuenta de Apple.
2. Abre `ios/App/App.xcodeproj` → target **App → Signing & Capabilities**: elige tu **Team** y deja "Automatically manage signing". El Bundle Identifier es `cl.rebooking.app`.
3. **Product → Archive** → **Distribute App → App Store Connect**.
4. En appstoreconnect.apple.com: crea la app, completa ficha, capturas (6,9" y 6,5"), "App Privacy", cuenta demo, URL de privacidad, y envía a revisión. Primero conviene **TestFlight** con el equipo de Estudio Levels.

## 6. Revisión hecha el 7 oct. (ya corregido)
- iPhone: faltaban los textos de permiso de **cámara y fotos** (sin ellos la app se cierra al tomar una foto y Apple rechaza).
- iPhone: la app quedaba también para iPad → ahora **solo iPhone** (evita capturas y revisión de iPad).
- Pagos: dentro de la app ya **no aparecen planes, "Plan y facturación", "Ver planes" ni "Pagar ahora"** (regla 3.1.1 de Apple). La cuenta suspendida muestra un aviso sin botón de pago.
- Avisos: el botón de "Activar notificaciones" no se muestra en la app mientras no existan los avisos nativos.
- Sin conexión: pantalla propia "Sin conexión" con botón Reintentar (antes quedaba en blanco).
- Marketing: el enlace "Conoce re-booking" del login no se muestra en la app.

## 7. Riesgos de rechazo que siguen abiertos (honestos)
- **Apple 4.2 (función mínima):** una web envuelta puede ser rechazada si no aporta nada nativo. Para reducir el riesgo hay que sumar al menos **avisos push nativos** y **Face ID/huella** (Fase 3 del plan; aún no están). Es lo siguiente que recomiendo construir.
- **Apple 5.1.1:** eliminar la cuenta desde la app (hecho) y política de privacidad pública (pendiente).
- **Cuenta demo** obligatoria si la app pide login (pendiente).
- Compras: la app no vende planes ni cobra suscripciones dentro de la app (evita la regla 3.1.1). No agregar pagos dentro de la app.

## 8. Textos para las fichas (borrador)
**Nombre:** re-booking
**Subtítulo / descripción corta:** Agenda, caja y clientes de tu negocio en un solo lugar.
**Descripción larga:** re-booking es el sistema de gestión para barberías, salones y centros de bienestar. Desde el celular, tu equipo ve su agenda del día, agenda y mueve citas, cobra en el punto de venta, cuadra la caja y revisa clientes y ventas. Recibe avisos de nuevas citas, controla comisiones y mantén todo ordenado. Pensado para negocios en Chile. Necesitas una cuenta de re-booking creada por tu negocio.
**Categoría:** Negocios.
**Palabras clave:** agenda, citas, barbería, salón, caja, clientes, reservas.

## 9. Orden recomendado
1. (Claude) Paquete de producción con los cambios móviles + eliminar cuenta → (tú) probar y mergear.
2. (Tú) Política de privacidad revisada por abogado y publicada; correo de soporte; cuenta demo.
3. (Claude) Avisos push nativos y Face ID (para Apple 4.2).
4. (Tú) Abrir cuentas y pagar. D-U-N-S primero (tarda).
5. (Tú + Claude) Subir `.aab` a Google Play y Archive en Xcode → TestFlight → revisión.
