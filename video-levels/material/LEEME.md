# THE LEVELS SHOW: material original

Pon aquí tus archivos originales (no se editan, solo se analizan):

- `video/`  → clips de video (.mp4, .mov). Nómbralos con algo claro: `01-corte-fade.mp4`.
- `audio/`  → música, voces, efectos (.mp3, .wav, .m4a).
- `logos/`  → logotipos (.png con fondo transparente o .svg).

Límite de GitHub: 100 MB por archivo. Si un clip pesa más, comprímelo:
`ffmpeg -i original.mov -c:v libx264 -crf 20 -preset slow -c:a aac clip.mp4`
