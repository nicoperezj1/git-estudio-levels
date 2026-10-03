# Protocolo de brechas de seguridad (BORRADOR)

Una **brecha** es cualquier acceso, pérdida, alteración o divulgación no autorizada de datos personales (cuenta hackeada, base expuesta, clave filtrada, foto pública, celular perdido con sesión abierta).

## 1. Responsables
Líder del incidente: [nombre]. Técnico: [Pablo / quien administre producción]. Legal: [abogado]. Comunicaciones: [nombre].

## 2. Pasos
1. **Detectar y avisar** de inmediato al líder (cualquiera del equipo puede dar la alerta).
2. **Contener (primeras horas):** revocar claves y sesiones afectadas, rotar secretos (por ejemplo las de Mercado Pago, Supabase, Resend), cerrar la ruta o permiso expuesto, quitar archivos públicos.
3. **Evaluar:** qué datos, de qué negocios y cuántas personas; si hay datos sensibles (salud), de menores o financieros; si hay riesgo para las personas.
4. **Notificar al negocio afectado** sin dilación, con la información disponible (meta contractual: [48/72] horas).
5. **Notificar a la Agencia de Protección de Datos Personales** y, cuando haya riesgo, **a las personas afectadas**, sin dilación indebida (plazos exactos: confirmar con abogado). Lo notifica el responsable (el negocio); re-booking le da los antecedentes y la plantilla.
6. **Corregir la causa** y verificar.
7. **Registrar** el incidente y lo aprendido en [documento].

## 3. Contenido mínimo del aviso
Qué pasó y cuándo; qué datos y cuántas personas; posibles consecuencias; qué se hizo; qué debe hacer la persona (cambiar clave, estar atenta a correos falsos); contacto.

## 4. Claves ya expuestas (3 oct. 2026)
`MP_WEBHOOK_SECRET` y el token `APP_USR` de Mercado Pago aparecieron en capturas de pantalla. Renovarlas y cargarlas en Vercel (ver CONTEXTO).
