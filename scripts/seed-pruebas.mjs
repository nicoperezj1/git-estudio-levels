// Datos de prueba para el Supabase de PRUEBAS (rebooking-pruebas). Solo desarrollo local.
//
// Uso (desde la carpeta del proyecto, con .env.local apuntando a PRUEBAS):
//   node scripts/seed-pruebas.mjs --dry   # muestra que crearia, sin tocar nada
//   node scripts/seed-pruebas.mjs         # crea los datos
//   node scripts/seed-pruebas.mjs --crear-negocio   # igual, y si el admin no tiene negocio, crea uno de pruebas
//
// SEGURIDAD: se niega a correr si NEXT_PUBLIC_SUPABASE_URL no es el proyecto de pruebas.
// Es re-ejecutable: no duplica usuarios ni clientes que ya existan.
// NO incluir este archivo en los zips que se entregan a Pablo.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRUEBAS_REF = "ucwrdmwtlesayjxmlbve";
const ADMIN_EMAIL = "nicoperezj1@gmail.com";
const PASSWORD = "Prueba2026!"; // clave de los usuarios de prueba (solo en pruebas)
const DRY = process.argv.includes("--dry");
const CREATE_TENANT = process.argv.includes("--crear-negocio");

// ---------- .env.local ----------
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("No encuentro .env.local. Corre este comando dentro de la carpeta del proyecto (cd ~/barberia).");
    process.exit(1);
  }
  return env;
}
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url.includes(PRUEBAS_REF)) {
  console.error(`\nPARADO: tu .env.local NO apunta al proyecto de pruebas (${PRUEBAS_REF}).`);
  console.error(`URL actual: ${url || "(vacia)"}\nNo se toco nada.`);
  process.exit(1);
}
if (!serviceKey && !DRY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

// ---------- fechas en hora de Chile ----------
const TZ = "America/Santiago";
function chileToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dow(ymd) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = domingo
}
// ISO con el offset real de Chile para esa fecha/hora (maneja el cambio de hora).
function chileIso(ymd, hh, mm = 0) {
  const naive = new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(naive).find((p) => p.type === "timeZoneName")?.value || "GMT-03:00";
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const sign = m ? (m[1] === "-" ? -1 : 1) : -1;
  const offMin = m ? sign * (Number(m[2]) * 60 + Number(m[3] || 0)) : -180;
  return new Date(naive.getTime() - offMin * 60000).toISOString();
}

// ---------- datos ----------
const PROS = [
  { key: "arriendo", name: "Matías Soto", email: "nicoperezj1+arriendo@gmail.com", pin: "1111", role: "barber", extra: { work_mode: "rental", rental_daily_rate: 16000 } },
  { key: "comision48", name: "Camila Rojas", email: "nicoperezj1+comision48@gmail.com", pin: "2222", role: "barber", extra: { work_mode: "commission", commission_rate: 48 } },
  { key: "pro3", name: "Diego Fuentes", email: "nicoperezj1+diego@gmail.com", pin: "4444", role: "barber", extra: { work_mode: "commission", commission_rate: 40 } },
  { key: "pro4", name: "Valentina Paredes", email: "nicoperezj1+valentina@gmail.com", pin: "5555", role: "barber", extra: { work_mode: "commission", commission_rate: 40 } },
];
const RECEP = { key: "recepcion", name: "David Muñoz", email: "nicoperezj1+recepcion@gmail.com", pin: "1234", role: "receptionist", extra: {} };

const SERVICES = [
  { name: "Corte de cabello", price: 12000, duration: 45 },
  { name: "Corte + barba", price: 18000, duration: 60 },
  { name: "Perfilado de barba", price: 8000, duration: 30 },
  { name: "Color / decoloración", price: 35000, duration: 90 },
];

const NAMES = [
  "Sebastián Araya", "Javier Núñez", "Felipe Castillo", "Ignacio Vera", "Tomás Morales",
  "Benjamín Silva", "Cristóbal Reyes", "Nicolás Herrera", "Joaquín Contreras", "Martín Tapia",
  "Vicente Salazar", "Agustín Pizarro", "Gabriel Espinoza", "Maximiliano Lagos", "Renato Bravo",
  "Francisco Mora", "Andrés Cárdenas", "Rodrigo Figueroa", "Pablo Sandoval", "Esteban Navarro",
];
// 20 clientes: tiktok x4, instagram x4, promocion x3, google_maps x2, walk_in x2, link x2,
// influencer x1, manual (registro anterior) x1, sin registrar x1.
const SOURCES = [
  ["tiktok"], ["instagram"], ["promotion", "VERANO20"], ["tiktok"], ["instagram"],
  ["google_maps"], ["walk_in"], ["promotion", "AMIGO10"], ["link"], ["instagram"],
  ["tiktok"], ["influencer", "@barber.cl"], ["google_maps"], ["promotion", "VERANO20"], ["link"],
  ["walk_in"], ["tiktok"], ["instagram"], ["manual"], [null],
];
const DAYS_AGO = [170, 150, 140, 120, 100, 95, 80, 70, 60, 45, 40, 30, 25, 20, 14, 10, 7, 4, 2, 0];
const APPT_DAY_OFFSET = [-4, -3, -3, -2, -2, -1, -1, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6];

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- plan (dry) ----------
const today = chileToday();
const plan = NAMES.map((name, i) => {
  let day = addDays(today, APPT_DAY_OFFSET[i]);
  if (dow(day) === 0) day = addDays(day, 1); // sin domingos (los horarios son lun-sab)
  const diff = (new Date(`${day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000;
  let status = diff < 0 ? "completed" : i % 2 ? "confirmed" : "scheduled";
  if (diff < 0 && i % 7 === 3) status = "cancelled";
  if (diff < 0 && i % 9 === 4) status = "no_show";
  return { name, source: SOURCES[i], daysAgo: DAYS_AGO[i], day, hour: 10 + Math.floor(i / 4) * 2, pro: PROS[i % 4], status };
});

if (DRY) {
  console.log(`MODO DRY (no se toca nada). Hoy en Chile: ${today}\n`);
  console.log("Profesionales:"); PROS.forEach((p) => console.log(`  ${p.name} <${p.email}> PIN ${p.pin} ${JSON.stringify(p.extra)}`));
  console.log(`Recepcion: ${RECEP.name} <${RECEP.email}> PIN ${RECEP.pin}`);
  console.log(`Admin: ${ADMIN_EMAIL} -> PIN 3333\nClientes y citas:`);
  plan.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(20)} ${String(p.source[0]).padEnd(11)} ${p.day} ${p.hour}:00 ${p.pro.name.padEnd(18)} ${p.status}  (${chileIso(p.day, p.hour)})`));
  process.exit(0);
}

// ---------- ejecucion ----------
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, what) => { if (r.error) { console.error(`Error en ${what}: ${r.error.message}`); process.exit(1); } return r.data; };

// 1) Admin y negocio
const admin = must(await sb.from("profiles").select("id, tenant_id, role").ilike("email", ADMIN_EMAIL).maybeSingle(), "buscar admin");
if (!admin) { console.error(`No encuentro el perfil ${ADMIN_EMAIL} en la base de pruebas.`); process.exit(1); }
if (!admin.tenant_id && !CREATE_TENANT) {
  console.error("El admin no tiene negocio (tenant_id). Corre de nuevo con --crear-negocio para crear uno de pruebas.");
  process.exit(1);
}
let tenantId = admin.tenant_id;
if (!tenantId) {
  // Igual que /api/auth/signup-business: negocio en prueba, admin vinculado y tenant_settings.
  const t = must(await sb.from("tenants").insert({
    name: "Estudio Levels (pruebas)", slug: `levels-pruebas-${Date.now().toString(36).slice(-4)}`,
    admin_email: ADMIN_EMAIL, admin_name: "Nicolás", plan: "pro", max_professionals: 8, status: "trial", // Pro: incluye Caja, Comisiones y Arriendo
    trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).select("id").single(), "crear negocio");
  tenantId = t.id;
  must(await sb.from("profiles").update({ tenant_id: tenantId, role: "admin" }).eq("id", admin.id), "vincular admin al negocio");
  must(await sb.from("tenant_settings").insert({ tenant_id: tenantId }), "tenant_settings");
  console.log("Negocio de pruebas creado y vinculado al admin.");
}
must(await sb.from("profiles").update({ personal_pin: "3333" }).eq("id", admin.id), "PIN del admin");
console.log(`Negocio: ${tenantId}. PIN del admin = 3333.`);

// 2) Servicios (se reutilizan si el negocio ya tiene)
let services = must(await sb.from("services").select("id, name, price, duration").eq("tenant_id", tenantId).eq("active", true), "leer servicios");
if (services.length < 3) {
  const created = must(await sb.from("services").insert(SERVICES.map((s) => ({ ...s, tenant_id: tenantId, active: true }))).select("id, name, price, duration"), "crear servicios");
  services = [...services, ...created];
  console.log(`Servicios creados: ${created.length}`);
}

// 3) Profesionales y recepcionista
async function ensureUser(u) {
  let { data: prof } = await sb.from("profiles").select("id").ilike("email", u.email).maybeSingle();
  let id = prof?.id;
  if (!id) {
    const r = await sb.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { name: u.name, role: u.role } });
    if (r.error) {
      const list = await sb.auth.admin.listUsers({ perPage: 1000 });
      id = list.data?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase())?.id;
      if (!id) { console.error(`No pude crear ${u.email}: ${r.error.message}`); process.exit(1); }
    } else id = r.data.user.id;
  }
  must(await sb.from("profiles").upsert({
    id, name: u.name, email: u.email, role: u.role, tenant_id: tenantId, active: true,
    personal_pin: u.pin, booking_slug: slugify(u.name), phone: "+56955500000", ...u.extra,
  }, { onConflict: "id" }), `perfil ${u.name}`);
  return id;
}
for (const p of PROS) p.id = await ensureUser(p);
RECEP.id = await ensureUser(RECEP);
console.log(`Profesionales y recepcion listos (clave: ${PASSWORD}).`);

// 4) Horario lun-sab 10-20 y servicios asignados a cada profesional
const schedule = PROS.flatMap((p) => [1, 2, 3, 4, 5, 6].map((d) => ({ barber_id: p.id, day_of_week: d, is_working: true, start_time: "10:00", end_time: "20:00" })));
must(await sb.from("barber_schedule").upsert(schedule, { onConflict: "barber_id,day_of_week" }), "horarios");
const assign = PROS.flatMap((p) => services.map((s) => ({ barber_id: p.id, service_id: s.id })));
must(await sb.from("barber_service_assignments").upsert(assign, { onConflict: "barber_id,service_id" }), "servicios por profesional");

// 5) Clientes + citas (solo para clientes nuevos; no duplica al re-ejecutar)
let newClients = 0, newAppts = 0;
for (let i = 0; i < plan.length; i++) {
  const p = plan[i];
  const nn = String(i + 1).padStart(2, "0");
  const email = `cliente${nn}@prueba.test`;
  const exists = must(await sb.from("clients").select("id").eq("tenant_id", tenantId).eq("email", email).maybeSingle(), "buscar cliente");
  if (exists) continue;

  const created_at = new Date(Date.now() - p.daysAgo * 86400000).toISOString();
  const client = must(await sb.from("clients").insert({
    name: p.name, email, phone: `+569555000${nn}`, tenant_id: tenantId,
    acquisition_source: p.source[0], acquisition_detail: p.source[1] || null, created_at,
  }).select("id").single(), `cliente ${p.name}`);
  newClients++;

  const svc = services[i % services.length];
  const startMin = svc.duration || 45;
  const endH = p.hour + Math.floor(startMin / 60), endM = startMin % 60;
  const appt = must(await sb.from("appointments").insert({
    client_id: client.id, barber_id: p.pro.id, date: p.day,
    start_time: chileIso(p.day, p.hour), end_time: chileIso(p.day, endH, endM),
    status: p.status, tenant_id: tenantId, source: p.source[0] === "link" ? "link" : "manual",
  }).select("id").single(), `cita ${p.name}`);
  must(await sb.from("appointment_services").insert({ appointment_id: appt.id, service_id: svc.id, price: svc.price }), `servicio de la cita ${p.name}`);
  newAppts++;
}
console.log(`Clientes nuevos: ${newClients}. Citas nuevas: ${newAppts}.`);

// 6) Ventas de las citas completadas (para tener ingresos en el cierre de septiembre) y un egreso del
//    mes anterior registrado hoy (el caso que se reporto: antes no salia en el cierre de ese mes).
const seedClients = must(await sb.from("clients").select("id").eq("tenant_id", tenantId).like("email", "cliente%@prueba.test"), "clientes de prueba");
const doneAppts = seedClients.length === 0 ? [] : must(await sb.from("appointments")
  .select("id, barber_id, client_id, start_time, appointment_services(price)")
  .eq("tenant_id", tenantId).eq("status", "completed").in("client_id", seedClients.map((c) => c.id)), "citas completadas");
const methods = ["cash", "debit_card", "credit_card"];
let newSales = 0;
for (let i = 0; i < doneAppts.length; i++) {
  const a = doneAppts[i];
  const marker = `seed-venta:${a.id}`;
  const have = must(await sb.from("transactions").select("id").eq("tenant_id", tenantId).eq("notes", marker).maybeSingle(), "buscar venta");
  if (have) continue;
  const total = (a.appointment_services || []).reduce((t, x) => t + Number(x.price || 0), 0) || 12000;
  const tx = must(await sb.from("transactions").insert({
    type: "income", status: "completed", subtotal: total, total, payment_method: methods[i % 3],
    client_id: a.client_id, barber_id: a.barber_id, tenant_id: tenantId, notes: marker, created_at: a.start_time,
  }).select("id").single(), "venta de prueba");
  must(await sb.from("transaction_items").insert({ transaction_id: tx.id, description: "Servicio (prueba)", quantity: 1, unit_price: total, total }), "item de venta");
  newSales++;
}
console.log(`Ventas de prueba nuevas: ${newSales}.`);
// Propinas de ejemplo ($1.000 en las ventas pares) para ver la linea "Propinas" del libro del profesional.
{
  const seedSales = must(await sb.from("transactions").select("id, notes, tip_amount").eq("tenant_id", tenantId).like("notes", "seed-venta:%").order("created_at", { ascending: true }), "ventas de prueba");
  let tipped = 0;
  for (let i = 0; i < seedSales.length; i += 2) {
    if (Number(seedSales[i].tip_amount) === 0) { must(await sb.from("transactions").update({ tip_amount: 1000 }).eq("id", seedSales[i].id), "propina de ejemplo"); tipped++; }
  }
  if (tipped) console.log(`Propinas de ejemplo: ${tipped}.`);
}

{
  const [ty, tm] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(ty, tm - 2, 1));
  const prevMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const marker = "seed-egreso-mes-anterior";
  const have = must(await sb.from("transactions").select("id").eq("tenant_id", tenantId).eq("notes", marker).maybeSingle(), "buscar egreso");
  if (!have) {
    const r = await sb.from("transactions").insert({
      type: "expense", status: "completed", subtotal: 45000, total: 45000, payment_method: "transfer",
      tenant_id: tenantId, assigned_to: "business", notes: marker, accounting_month: prevMonth, created_by: admin.id,
    }).select("id").single();
    if (r.error) {
      console.log("Egreso del mes anterior: se creara cuando apliques la migracion 090 y vuelvas a correr este comando.");
    } else {
      must(await sb.from("transaction_items").insert({ transaction_id: r.data.id, description: "Luz del mes anterior (prueba)", quantity: 1, unit_price: 45000, total: 45000 }), "item del egreso");
      console.log(`Egreso de prueba creado hoy que corresponde a ${prevMonth.slice(0, 7)}.`);
    }
  }
}
console.log("\nListo. Usuarios (clave de todos: " + PASSWORD + "):");
for (const u of [...PROS, RECEP]) console.log(`  ${u.name.padEnd(18)} ${u.email.padEnd(38)} PIN ${u.pin}`);
