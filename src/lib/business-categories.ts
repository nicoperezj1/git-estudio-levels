// Rubro del negocio (Nico, 28-sep). Debe coincidir con el CHECK de
// tenants.business_category (migracion 078). null/"" = sin clasificar.
export const BUSINESS_CATEGORIES = [
  { value: "barberia", label: "Barbería" },
  { value: "peluqueria", label: "Peluquería" },
  { value: "estetica", label: "Centro de estética" },
  { value: "manicure", label: "Manicure / uñas" },
  { value: "spa", label: "Spa" },
  { value: "clinica", label: "Clínica" },
  { value: "kinesiologia", label: "Kinesiología" },
  { value: "otro", label: "Otro" },
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number]["value"];

export const BUSINESS_CATEGORY_VALUES: string[] = BUSINESS_CATEGORIES.map((c) => c.value);

export function businessCategoryLabel(value: string | null | undefined): string {
  if (!value) return "Sin clasificar";
  return BUSINESS_CATEGORIES.find((c) => c.value === value)?.label || "Sin clasificar";
}
