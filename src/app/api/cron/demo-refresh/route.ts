import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// Vercel Cron (cada 3 horas): deja el negocio DEMO ("re-booking Demo", slug rebooking-demo) con citas y
// ventas de los ultimos 6 dias y los proximos 3, para que quien revise la app en Google Play / App Store
// (o quien la pruebe) la vea siempre con actividad real de HOY y no vacia.
//
// Reglas de seguridad:
//   - Solo toca filas de ESE negocio (tenant_id del slug rebooking-demo cuyo nombre contiene "Demo").
//   - Solo borra lo que el mismo cron creo antes (citas con source = "demo", ventas con notes = "[demo-auto]").
//   - Los clientes demo no tienen correo, asi que los recordatorios y correos de post servicio no envian nada.
//   - Requiere CRON_SECRET (Vercel lo manda solo).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Santiago";
const DEMO_SLUG = "rebooking-demo";
const TX_NOTE = "[demo-auto]";

const DEMO_CLIENTS: Array<[string, string]> = [
  ["Matías Rojas", "+56900000101"], ["Camila Fuentes", "+56900000102"], ["Sebastián Araya", "+56900000103"],
  ["Francisca Contreras", "+56900000104"], ["Diego Valenzuela", "+56900000105"], ["Javiera Muñoz", "+56900000106"],
  ["Felipe Sandoval", "+56900000107"], ["Constanza Vega", "+56900000108"], ["Benjamín Herrera", "+56900000109"],
  ["Valentina Pizarro", "+56900000110"], ["Nicolás Cáceres", "+56900000111"], ["Antonia Bravo", "+56900000112"],
  ["Joaquín Tapia", "+56900000113"], ["Fernanda Soto", "+56900000114"], ["Vicente Maldonado", "+56900000115"],
  ["Catalina Ibáñez", "+56900000116"], ["Tomás Figueroa", "+56900000117"], ["Isidora Navarro", "+56900000118"],
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chileParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => Number(f.find((p) => p.type === t)?.value || 0);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute") };
}

// Instante real (UTC) de una hora de pared de Chile.
function chileInstant(y: number, m: number, d: number, h: number, mi: number): Date {
  const target = Date.UTC(y, m - 1, d, h, mi);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = chileParts(new Date(t));
    t += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return new Date(t);
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data: tenant } = await supabase.from("tenants").select("id, name").eq("slug", DEMO_SLUG).maybeSingle();
  if (!tenant || !/demo/i.test(tenant.name || "")) {
    return NextResponse.json({ skipped: "no hay negocio demo" });
  }
  const tenantId = tenant.id as string;

  const [{ data: barbers }, { data: services }] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("tenant_id", tenantId).eq("role", "barber").eq("active", true).order("name"),
    supabase.from("services").select("id, name, price, duration").eq("tenant_id", tenantId).eq("active", true).order("name"),
  ]);
  if (!barbers?.length || !services?.length) {
    return NextResponse.json({ skipped: "faltan profesionales o servicios demo" });
  }

  // Clientes demo (sin correo). Se crean una vez; si el insert falla se usan los que ya existan.
  const { data: existingClients } = await supabase.from("clients").select("id, phone").eq("tenant_id", tenantId);
  const have = new Set((existingClients || []).map((c: any) => c.phone));
  const toCreate = DEMO_CLIENTS.filter(([, phone]) => !have.has(phone)).map(([name, phone]) => ({ name, phone, email: null, tenant_id: tenantId }));
  if (toCreate.length) {
    const { error } = await supabase.from("clients").insert(toCreate);
    if (error) console.error("[demo-refresh] clientes:", error.message);
  }
  const { data: clientsAll } = await supabase.from("clients").select("id, name, email").eq("tenant_id", tenantId);
  // Solo clientes sin correo: asi nada de lo que corre en el sistema le escribe a una persona real.
  const clients = (clientsAll || []).filter((c: any) => !c.email);
  if (!clients.length) return NextResponse.json({ skipped: "sin clientes demo" });

  // Borra lo que este cron creo antes (ventas primero: la venta apunta a la cita).
  const { data: oldAppts } = await supabase.from("appointments").select("id").eq("tenant_id", tenantId).eq("source", "demo");
  const oldIds = (oldAppts || []).map((a: any) => a.id);
  await supabase.from("transactions").delete().eq("tenant_id", tenantId).eq("notes", TX_NOTE);
  for (let i = 0; i < oldIds.length; i += 200) {
    await supabase.from("appointments").delete().in("id", oldIds.slice(i, i + 200));
  }

  const now = chileParts(new Date());
  const nowMin = now.h * 60 + now.mi;
  const base = Date.UTC(now.y, now.m - 1, now.d);

  const apptRows: any[] = [];
  const meta: Array<{ svc: any[]; total: number; method: string; completed: boolean; barberId: string; clientId: string; endInstant: Date }> = [];
  const methods = ["debit_card", "debit_card", "credit_card", "cash", "transfer"];

  for (let off = -6; off <= 3; off++) {
    const day = new Date(base + off * 86400000);
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (day.getUTCDay() === 0) continue; // domingo cerrado
    const date = ymd(y, m, d);
    const isToday = off === 0;
    const isFuture = off > 0;
    const saturday = day.getUTCDay() === 6;

    barbers.forEach((b: any, bi: number) => {
      const r = rng(y * 10000 + m * 100 + d + bi * 7919);
      let t = (saturday ? 10 : 10) * 60 + Math.floor(r() * 3) * 15;
      const closing = (saturday ? 17 : 19) * 60;
      while (t < closing - 30) {
        let nextT = t + 30;
        if (r() < (isFuture ? 0.45 : 0.62)) {
          // Un solo servicio por cita: hay combos como "Corte + Barba" y juntar servicios se veria raro.
          const chosen = [services[Math.floor(r() * services.length)]];
          const dur = chosen.reduce((s: number, x: any) => s + Number(x.duration || 30), 0);
          if (t + dur > closing) break;
          const client = clients[Math.floor(r() * clients.length)];
          const total = chosen.reduce((s: number, x: any) => s + Number(x.price || 0), 0);
          const endMin = t + dur;
          nextT = endMin + Math.floor(r() * 3) * 15;
          let status: string;
          if (isFuture) status = r() < 0.6 ? "confirmed" : "scheduled";
          else if (isToday) status = endMin <= nowMin ? "completed" : t <= nowMin ? "in_progress" : r() < 0.6 ? "confirmed" : "scheduled";
          else status = r() < 0.06 ? "cancelled" : r() < 0.04 ? "no_show" : "completed";
          const wall = (min: number) => `${date}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00.000Z`;
          apptRows.push({
            client_id: client.id, barber_id: b.id, date, start_time: wall(t), end_time: wall(endMin), status,
            tenant_id: tenantId, source: "demo", reminder_sent: true, post_service_sent: true,
          });
          meta.push({
            svc: chosen, total, method: methods[Math.floor(r() * methods.length)], completed: status === "completed",
            barberId: b.id, clientId: client.id, endInstant: chileInstant(y, m, d, Math.floor(endMin / 60), endMin % 60),
          });
        }
        // La siguiente cita parte despues de que termina esta (con un respiro de 0 a 30 min).
        t = nextT;
      }
    });
  }

  let created = 0;
  let sales = 0;
  for (let i = 0; i < apptRows.length; i += 100) {
    const slice = apptRows.slice(i, i + 100);
    let { data: inserted, error } = await supabase.from("appointments").insert(slice).select("id");
    if (error && /reminder_sent|post_service_sent/i.test(error.message)) {
      const legacy = slice.map(({ reminder_sent: _r, post_service_sent: _p, ...rest }) => rest);
      ({ data: inserted, error } = await supabase.from("appointments").insert(legacy).select("id"));
    }
    if (error || !inserted) { console.error("[demo-refresh] citas:", error?.message); continue; }
    created += inserted.length;

    const svcRows: any[] = [];
    inserted.forEach((a: any, k: number) => {
      meta[i + k].svc.forEach((s: any) => svcRows.push({ appointment_id: a.id, service_id: s.id, price: s.price }));
    });
    await supabase.from("appointment_services").insert(svcRows);

    for (let k = 0; k < inserted.length; k++) {
      const mt = meta[i + k];
      if (!mt.completed) continue;
      const txRow: Record<string, any> = {
        type: "income", status: "completed", subtotal: mt.total, discount: 0, total: mt.total,
        payment_method: mt.method, notes: TX_NOTE, client_id: mt.clientId, barber_id: mt.barberId,
        appointment_id: inserted[k].id, tenant_id: tenantId, created_at: mt.endInstant.toISOString(),
        created_by: mt.barberId, origin: "pos",
      };
      let { data: tx, error: txErr } = await supabase.from("transactions").insert(txRow).select("id").single();
      if (txErr && /origin|created_by/i.test(txErr.message)) {
        const { origin: _o, created_by: _c, ...legacy } = txRow;
        ({ data: tx, error: txErr } = await supabase.from("transactions").insert(legacy).select("id").single());
      }
      if (txErr || !tx) { console.error("[demo-refresh] venta:", txErr?.message); continue; }
      sales++;
      await supabase.from("transaction_items").insert(
        mt.svc.map((s: any) => ({ transaction_id: tx!.id, service_id: s.id, description: s.name, quantity: 1, unit_price: s.price, total: s.price }))
      );
    }
  }

  return NextResponse.json({ ok: true, citas: created, ventas: sales });
}
