import { checkTotalsPure } from "../src/lib/checkout-check";
let fails = 0;
const t = (name: string, got: string[], want: string[]) => {
  const ok = JSON.stringify(got.sort()) === JSON.stringify(want.sort());
  if (!ok) { fails++; console.log("FALLA", name, got, "esperado", want); } else console.log("ok", name);
};
const codes = (i: any) => checkTotalsPure(i).map((x) => x.code);
const base = { items: [{ type: "service", id: "a", name: "Corte", price: 12000, quantity: 1 }, { type: "product", id: "b", name: "Cera", price: 5000, quantity: 2 }], subtotal: 22000, discount: 0, total: 22000 };
t("venta normal", codes(base), []);
t("con descuento", codes({ ...base, discount: 2000, total: 20000 }), []);
t("pago dividido ok", codes({ ...base, payments: [{ method: "cash", amount: 12000 }, { method: "debit_card", amount: 10000 }] }), []);
t("subtotal inflado", codes({ ...base, subtotal: 30000, total: 30000 }), ["subtotal_mismatch"]);
t("total no cuadra", codes({ ...base, total: 1000 }), ["total_mismatch"]);
t("descuento mayor al subtotal", codes({ ...base, discount: 25000, total: -3000 }), ["discount_out_of_range"]);
t("pagos no suman", codes({ ...base, payments: [{ method: "cash", amount: 100 }] }), ["payments_mismatch"]);
t("cantidad 0", codes({ ...base, items: [{ ...base.items[0], quantity: 0 }], subtotal: 0, total: 0 }), ["invalid_item"]);
t("puntos de más", codes({ ...base, discount: 100, total: 21900, redeemedPoints: 5 }), ["points_exceed_discount"]);
console.log(fails ? `${fails} fallas` : "TODO OK");
process.exit(fails ? 1 : 0);
