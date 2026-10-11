-- 109: Plan Pro desde 4 profesionales: $42.990 (incluye 4) + $3.500 por profesional adicional (hasta 20).
-- Con 6 profesionales el precio sigue en $49.990 (42.990 + 2 x 3.500), igual que antes.
-- Re-ejecutable. Afecta lo que se muestra en /suscribirse y lo que se cobra a nuevos Pro y a cambios de plan.
UPDATE plan_limits
SET price_clp = 42990, included_professionals = 4, extra_professional_price_clp = 3500, max_professionals = 20
WHERE plan = 'pro';

-- Verificacion (debe devolver 1 fila: 42990 | 4 | 3500 | 20):
SELECT price_clp, included_professionals, extra_professional_price_clp, max_professionals FROM plan_limits WHERE plan = 'pro';
