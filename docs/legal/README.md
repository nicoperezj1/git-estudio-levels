# Documentos legales (borradores para revisión de abogado)

**Estado:** borradores preparados el 3 oct. 2026 para cumplir la Ley 21.719 (rige desde el **1 dic. 2026**). Ninguno es asesoría legal ni está listo para publicarse. Un abogado debe validar plazos, bases de licitud, cláusulas y redacción final. Lo que está entre [corchetes] hay que completarlo.

| Archivo | Para qué |
|---|---|
| `TERMINOS-BORRADOR.md` | Términos y condiciones nuevos (reemplazan a `/terminos`, que hoy tiene 9 secciones cortas). |
| `CONTRATO-ENCARGO-BORRADOR.md` | Contrato de encargo de datos entre cada negocio (responsable) y re-booking (encargado). Va como anexo de los términos. |
| `PROCEDIMIENTO-DERECHOS.md` | Cómo se recibe, verifica y responde una solicitud de acceso, rectificación, supresión, oposición, portabilidad o bloqueo. |
| `PROTOCOLO-BRECHAS.md` | Qué hacer si hay una filtración de datos. |
| `REGISTRO-TRATAMIENTOS.md` | Inventario de qué datos se tratan, para qué, con qué base, dónde y cuánto tiempo. |
| `REVISION-TECNICA.md` | Hallazgos del código que afectan el cumplimiento (PIN sin hash, fotos públicas, consentimientos, etc.) y qué hacer. |
| `src/app/privacidad/page.tsx` | Política de privacidad. **Devuelve 404** hasta que se active `LEGAL_PAGES_ENABLED=1` en Vercel. |

## Para publicar (orden)
1. Elegir la razón social que opera re-booking (ver el plan de traspaso con Pablo) y completar los [corchetes].
2. Abogado revisa los 5 textos. Se ajusta lo que pida.
3. Se reemplaza `/terminos` con la versión aprobada y se enlaza la política desde registro, reserva online, pie de la web y la app.
4. Se activa `LEGAL_PAGES_ENABLED=1` en Vercel.
5. Los negocios aceptan el contrato de encargo al iniciar sesión (pantalla de aceptación pendiente de construir; ver `REVISION-TECNICA.md`).
