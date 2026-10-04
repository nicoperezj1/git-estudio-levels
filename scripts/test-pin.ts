import { hashPin, pinOr } from "../src/lib/pin";
let fails = 0;
const t = (name: string, got: unknown, want: unknown) => { if (got !== want) { fails++; console.log("FALLA", name, got, "esperado", want); } else console.log("ok", name); };
process.env.PIN_PEPPER = "secreto-de-prueba";
const h1 = hashPin("1234"), h2 = hashPin("1234"), h3 = hashPin("1235");
t("misma huella para el mismo PIN", h1 === h2, true);
t("PIN distinto, huella distinta", h1 === h3, false);
t("huella de 64 hex", /^[0-9a-f]{64}$/.test(h1 || ""), true);
t("PIN inválido sin huella", hashPin("12a4"), null);
t("PIN corto sin huella", hashPin("123"), null);
(async () => {
  const fake = { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) };
  t("filtro con huella", (await pinOr(fake, "1234")).includes("personal_pin_hash.eq."), true);
  t("filtro con PIN raro no inyecta", await pinOr(fake, "1234,role.eq.admin"), "personal_pin.eq.__sin_pin__");
  console.log(fails ? `${fails} fallas` : "TODO OK");
  process.exit(fails ? 1 : 0);
})();
