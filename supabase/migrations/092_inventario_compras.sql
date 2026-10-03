-- 092: Fase 4 — inventario (venta / insumo), solicitud de insumos y proveedores. Aditiva y re-ejecutable.
-- NO cambia ni borra ningun dato existente. Hacer un RESPALDO antes de correrla.
--
-- Todo producto que ya existe queda como 'sale' (Venta): sigue apareciendo en el POS exactamente como hoy.
-- Solo los marcados como 'supply' (Insumo) dejan de verse en el POS y pasan a la Solicitud de insumos.

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'sale';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('sale', 'supply'));
  END IF;
END $$;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;     -- cosmeticos, aseo, consumibles, generales o una propia

-- Categorias propias del negocio ("+ categoria"). Las 4 de base viven en el codigo.
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories ON product_categories(tenant_id, lower(name));
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;      -- sin politicas: solo la API (llave de servicio)

-- Correo al que llegan las solicitudes de insumos (lo elige el administrador).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS supply_request_email TEXT;

-- Solicitudes de insumos que levanta recepcion. Quedan en el Dashboard hasta que el administrador las borra.
CREATE TABLE IF NOT EXISTS supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID,
  created_by_name TEXT,
  items JSONB NOT NULL DEFAULT '[]',        -- [{ product_id, name, current_stock, to_buy }]
  notes TEXT,
  email_to TEXT,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by_name TEXT,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_supply_requests ON supply_requests(tenant_id, status, created_at DESC);
ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;

-- Proveedores del negocio (nombre del comercio y celular, escritos a mano).
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers ON suppliers(tenant_id, active);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Verificacion (Supabase muestra solo el ultimo resultado): debe devolver 3 filas.
SELECT table_name FROM information_schema.tables WHERE table_name IN ('product_categories', 'supply_requests', 'suppliers');
