-- Calendario "profesionales agrupados": el administrador puede activar que el selector
-- 1 / 3 / 7 dias aplique a todos sus profesionales a la vez (solo negocios de 2 a 4
-- profesionales; el limite lo controla la app). Apagado por defecto. Aditiva y re-ejecutable.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_group_week BOOLEAN NOT NULL DEFAULT FALSE;
