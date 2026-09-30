# Pago de suscripciones re-booking (Mercado Pago) — nota para Pablo

Actualizado 28-sep-2026. Reemplaza lo que diga el doc de spec en Claude Docs donde haya diferencias.

## Modelo de cobro
- **Mensual**: suscripcion Mercado Pago (`POST /preapproval`, sin plan asociado, `status: "pending"`), cobro automatico. Monto = plan + profesionales extra, x1.19 IVA (silencioso).
- **Anual**: **pago unico** Checkout Pro (`POST /checkout/preferences`) por 12 meses con 20% dcto. NO se renueva solo. Motivo: MP limita planes/suscripciones a $350.000 CLP y el anual de Pro lo supera (MP soporte, caso 485322444, confirmo que la API tiene el mismo tope).
- Enterprise NO es self-serve (precio variable, lo ve ventas): excluido de `/api/plans`, `/api/billing/summary`, `subscribe` y `change-plan`.
- Un futuro cambio a Transbank Oneclick (renovacion anual automatica) esta en evaluacion; los precios, gracia, banners y pantalla de facturacion se reutilizan.

## Webhook unico: `/api/checkout/subscribe/webhook`
- Valida `x-signature` con `MP_WEBHOOK_SECRET` (si no esta seteada, avisa en logs y no valida). Siempre reconsulta el estado a la API de MP.
- Eventos: `subscription_preapproval|preapproval`, `subscription_authorized_payment|authorized_payment` (mensual) y `payment` (anual).
- `external_reference` del pago anual: `<signup_request id>` (primer pago), `renew:<subscription id>` (renovacion), `upgrade:<sub>:<plan>:<n>` (mejora, diferencia prorrateada).
- **Verificar en sandbox** los nombres reales de eventos/campos de Preapproval (se loguea el payload crudo).

## Estados y gracia
- Cobro mensual rechazado o anual vencido => `subscriptions.status='past_due'`, `grace_until = +2 dias`, `tenants.status='past_due'`.
- `/api/cron/suspend-past-due` (cada 6 h) suspende. Pago aprobado reactiva (`tenants.status='active'`).
- `/api/cron/annual-renewals` (diario 12:00 UTC): avisos por email (Resend) a 30/7/1 dia con link de renovacion; marca past_due al vencer.
- OJO: hoy `suspended` solo muestra banner, no bloquea el acceso. Decidir si se bloquea.

## Migraciones a aplicar (en orden)
074 (subscription_payments), 075 (precio por profesional, preapproval), 076 (anual pago unico). Definir valores reales de `included_professionals` y `extra_professional_price_clp` por plan.

## Variables de entorno
`MP_PLATFORM_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
Configurar la URL del webhook en el panel de MP (Tus integraciones > Webhooks, eventos: Pagos y Planes y suscripciones) con la URL publica de `/api/checkout/subscribe/webhook`.

## Pruebas pendientes (sandbox, URL publica, usuarios de prueba MP)
1. Mensual: alta -> negocio creado -> cobro aprobado. 2. Cobro rechazado -> past_due -> +2 dias suspendido -> pago -> reactivado.
3. Anual: alta, renovacion (link), mejora de plan (diferencia). 4. Mejorar plan mensual, cancelar (mensual y anual).
5. Verificar si Checkout Pro acepta montos > $350.000 en produccion.
6. `payer_email` de la suscripcion mensual debe coincidir con el email de la cuenta MP que paga.
7. Boleta/factura y tratamiento del IVA: confirmar con contador.
