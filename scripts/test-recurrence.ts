import { expandRepeat } from "../src/lib/recurrence";
let bad = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { bad++; console.log("FALLA", name, JSON.stringify(got), "esperaba", JSON.stringify(want)); } else console.log("ok", name); };
eq("diario 3 veces", expandRepeat("2026-10-12", { freq: "daily", count: 3 }), ["2026-10-12", "2026-10-13", "2026-10-14"]);
eq("cada 2 dias hasta", expandRepeat("2026-10-12", { freq: "daily", interval: 2, until: "2026-10-17" }), ["2026-10-12", "2026-10-14", "2026-10-16"]);
eq("semanal (lunes)", expandRepeat("2026-10-12", { freq: "weekly", count: 3 }), ["2026-10-12", "2026-10-19", "2026-10-26"]);
// fin de semana por medio: sab 10 oct 2026, sab+dom, cada 2 semanas
eq("fin de semana por medio", expandRepeat("2026-10-10", { freq: "weekly", interval: 2, weekdays: [6, 0], count: 4 }), ["2026-10-10", "2026-10-11", "2026-10-24", "2026-10-25"]);
eq("semanal L-V una semana", expandRepeat("2026-10-12", { freq: "weekly", weekdays: [1, 2, 3, 4, 5], until: "2026-10-18" }), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
eq("mensual dia 31", expandRepeat("2026-01-31", { freq: "monthly", count: 3 }), ["2026-01-31", "2026-02-28", "2026-03-31"]);
eq("anual 29 feb", expandRepeat("2028-02-29", { freq: "yearly", count: 2 }), ["2028-02-29", "2029-02-28"]);
eq("sin fin = solo una", expandRepeat("2026-10-12", { freq: "daily" }), ["2026-10-12"]);
eq("tope", expandRepeat("2026-10-12", { freq: "daily", count: 9999 }).length, 400);
process.exit(bad ? 1 : 0);
