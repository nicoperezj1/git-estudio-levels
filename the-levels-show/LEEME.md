# THE LEVELS SHOW

Reality de barbería de Estudio Levels, hecho con [Remotion](https://www.remotion.dev).
Proyecto independiente: no tiene nada que ver con la app de re-booking (vive solo en esta carpeta).

Estado: **proyecto vacío, sin composiciones**. Primero se sube el material, se analiza y se aprueba una estructura; recién ahí se edita.

## Carpetas

| Carpeta | Qué va |
|---|---|
| `material/video/` | Clips en bruto (`.mp4`, `.mov`) |
| `material/audio/` | Música, voces, efectos (`.mp3`, `.wav`) |
| `material/logos/` | Logos de Estudio Levels y THE LEVELS SHOW (`.png` con fondo transparente o `.svg`) |

`public/` es un acceso directo a `material/`, así que en el código se usa `staticFile("video/clip1.mp4")`.
Los videos y audios **no se suben a git** (pesan mucho); los logos sí.

## Instalar y abrir

En una ventana de Terminal, dentro de esta carpeta:

1. `cd ~/barberia/the-levels-show` (o donde esté el repo)
2. `npm install`  → debe terminar sin errores.
3. `npm run dev`  → abre Remotion Studio en `http://localhost:3000`. Hoy aparece vacío, es lo esperado.

## Cómo subir tu material

1. Copia los clips a `material/video/`, la música a `material/audio/` y los logos a `material/logos/`.
2. Usa nombres simples, sin espacios ni tildes: `01-corte-fade.mp4`, `musica-intro.mp3`, `logo-levels.png`.
3. Avísame en el chat. Yo hago esto, en orden:
   1. Analizo cada clip (duración, formato, resolución, contenido, mejores momentos).
   2. Te propongo la estructura del tráiler cinematográfico (escenas, ritmo, música, títulos).
   3. **Espero tu aprobación.** No edito nada antes.
   4. Armo la composición, la ves en el Studio y ajustamos.

## Comandos útiles

- `npm run dev`: Studio para previsualizar.
- `npx remotion render <id-composicion> out/trailer.mp4`: exportar (cuando exista una composición).
- `npm run lint`: revisar tipos y estilo.
