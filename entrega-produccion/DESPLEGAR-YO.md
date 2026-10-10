# Cómo subir cambios a producción (lo hace Nico; Pablo solo revisa cada semana)

Orden siempre igual: **respaldo → SQL → código → pruebas**. El SQL va ANTES del código.

## Una sola vez: confirma que tienes acceso
- GitHub: eres colaborador de `pdencina/barberia` (puedes subir ramas y abrir/mergear PR a `main`).
- Supabase: proyecto de **producción** `EstudioLevels` (ID `ulucmbuvupulwplsrcnx`). OJO: el de pruebas es "rebooking Base"; el panel pone "PRODUCTION" en los dos, **mira el nombre** arriba a la izquierda.
- Vercel: el proyecto de `pdencina/barberia` despliega solo al mergear a `main`.
Si falta alguno de los tres, es lo único que hay que pedirle a Pablo (una vez).

## Cada entrega
1. **Claude sube la rama** a `pdencina/barberia` (ej. `entrega-11-oct`). No toca `main`.
2. **Respaldo:** Supabase producción > Database > Backups (hay uno diario; mira que exista el de hoy).
3. **SQL en producción** (Supabase > SQL Editor > New query):
   - Pega el `.sql` que Claude te indique (ej. `entrega-produccion/SQL-102-103.sql`) y Run.
   - Al final debe salir la tabla de verificación con las filas que Claude dijo. Si sale error en rojo, **para y pégale el texto a Claude**.
4. **Código:** en GitHub abre `https://github.com/pdencina/barberia/pulls` > New pull request > base `main`, compare `entrega-11-oct` > Create. Revisa que solo cambien los archivos esperados y aprieta **Merge**. Vercel despliega solo (1-2 min; Vercel > Deployments debe quedar en "Ready").
5. **Pruebas rápidas en producción** (con tu cuenta de super admin): lo que Claude diga para esa entrega + que Dashboard y Calendario carguen. Si algo se ve mal: Vercel > Deployments > el deploy anterior > "Promote to Production" (vuelta atrás en 1 clic; el SQL no hace falta deshacerlo).
6. Avísale a Pablo por WhatsApp qué se subió (le sirve para su revisión semanal).

## Entrega actual: `entrega-11-oct`
- Antes: corre `entrega-produccion/VERIFICAR-MIGRACIONES.sql` en producción. Si devuelve filas, esas migraciones (073-099) faltan: córrelas primero (la tabla dice cuál archivo).
- SQL: `entrega-produccion/SQL-102-103.sql` (devuelve 2 filas).
- Probar: Calendario de un negocio con un solo profesional (1/3/7 días sin elegir); bloquear 1 cupo en Espacio Integral; Preferencias de reservas > "Presentación en links directos"; link de reserva en el celular.
