import { createHmac } from "crypto";

// PIN personal con "huella" (HMAC-SHA256 con un secreto del servidor) además del valor tal cual.
// Por qué HMAC y no bcrypt: los PIN se buscan por valor (¿qué administrador del negocio tiene el PIN 1234?),
// así que la huella tiene que ser siempre la misma para el mismo PIN. El secreto vive en el servidor
// (PIN_PEPPER; si no existe se usa la llave de servicio de Supabase), por eso una filtración de SOLO la base
// de datos no revela los PIN. Son 10.000 combinaciones: la protección de fondo sigue siendo el límite de
// intentos de cada ruta, no la huella.
//
// Se hace en 2 etapas, sin cortar nada:
//  1) (esta) las rutas aceptan el PIN por huella O por valor, y al guardar un PIN escriben las dos cosas;
//  2) cuando todos los PIN tengan huella (ver /api/superadmin/pin-backfill), se borra el valor en claro con
//     el SQL de docs/legal/REVISION-TECNICA.md, y desde ahí solo se compara la huella.
const DIGITS = /^\d{4}$/;

function pepper(): string {
  return process.env.PIN_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function hashPin(pin: string): string | null {
  const p = pepper();
  if (!p || !DIGITS.test(pin)) return null;
  return createHmac("sha256", p).update(`pin:${pin}`).digest("hex");
}

let ready: boolean | null = null;
let checkedAt = 0;

// ¿Existe la columna personal_pin_hash (migración 101)? Si existe se recuerda; si no, se vuelve a mirar cada minuto
// (así, al aplicar la migración no hace falta reiniciar nada).
export async function pinHashReady(supabase: any): Promise<boolean> {
  if (ready === true) return true;
  if (ready === false && Date.now() - checkedAt < 60_000) return false;
  const { error } = await supabase.from("profiles").select("personal_pin_hash").limit(1);
  ready = !error;
  checkedAt = Date.now();
  return ready;
}

// Filtro para .or(...): coincide por huella o por valor. Un PIN que no sean 4 dígitos no coincide con nada
// (y así nunca se mete texto raro en el filtro).
export async function pinOr(supabase: any, pin: unknown): Promise<string> {
  const p = typeof pin === "string" ? pin : String(pin ?? "");
  if (!DIGITS.test(p)) return "personal_pin.eq.__sin_pin__";
  const h = hashPin(p);
  if ((await pinHashReady(supabase)) && h) return `personal_pin.eq.${p},personal_pin_hash.eq.${h}`;
  return `personal_pin.eq.${p}`;
}

// Campos a guardar cuando se cambia un PIN (valor + huella si la columna existe).
export async function pinWriteFields(supabase: any, pin: unknown): Promise<Record<string, any>> {
  const p = typeof pin === "string" ? pin.trim() : "";
  const out: Record<string, any> = { personal_pin: p || null };
  if (await pinHashReady(supabase)) out.personal_pin_hash = p ? hashPin(p) : null;
  return out;
}
