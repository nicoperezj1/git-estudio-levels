// Categorias base de producto (Fase 4). Las propias del negocio ("+ categoria") se guardan en product_categories.
export const BASE_PRODUCT_CATEGORIES = ["Cosméticos", "Aseo", "Consumibles", "Generales"] as const;
export type ProductType = "sale" | "supply";
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = { sale: "Venta", supply: "Insumo" };
