-- 109: Plan Pro desde 4 profesionales: $42.990 (incluye 4) + $6.000 por profesional adicional, con la
-- PROMOCION de 6 profesionales a $49.990 (precio normal $54.990). Del 7.º en adelante: $49.990 + $6.000 cada uno,
-- igual que hoy (quienes ya tienen 6 o mas no cambian de precio).
--   4 -> 42.990 | 5 -> 48.990 | 6 -> 49.990 (promo) | 7 -> 55.990 | 8 -> 61.990 ...
-- seat_prices: precios fijos por cantidad; el codigo (lib/subscription-pricing.ts) los usa si existen.
-- Aditiva y re-ejecutable.
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS seat_prices JSONB;

UPDATE plan_limits
SET price_clp = 42990, included_professionals = 4, extra_professional_price_clp = 6000, max_professionals = 20,
    seat_prices = '{"6": 49990}'::jsonb
WHERE plan = 'pro';

-- Verificacion (debe devolver 1 fila: 42990 | 4 | 6000 | 20 | {"6": 49990}):
SELECT price_clp, included_professionals, extra_professional_price_clp, max_professionals, seat_prices FROM plan_limits WHERE plan = 'pro';
