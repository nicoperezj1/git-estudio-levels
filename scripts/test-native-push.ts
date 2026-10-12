// Prueba de src/lib/native-push.ts con un telefono simulado. Ejecutar: npx tsx scripts/test-native-push.ts
const store = new Map<string, string>();
const calls: { url: string; method: string; body: any }[] = [];
let permission: "granted" | "denied" = "granted";
let serverStatus = 200;
const listeners: Record<string, Function> = {};
const g: any = globalThis;
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
g.window = {
  location: { href: "/dashboard" },
  Capacitor: {
    getPlatform: () => "ios",
    Plugins: {
      FirebaseMessaging: {
        requestPermissions: async () => ({ receive: permission }),
        checkPermissions: async () => ({ receive: permission }),
        getToken: async () => ({ token: "token-del-telefono-0000000001" }),
        addListener: async (n: string, cb: Function) => { listeners[n] = cb; },
      },
    },
  },
};
g.fetch = async (url: string, init: any) => { calls.push({ url, method: init.method, body: JSON.parse(init.body) }); return new Response("{}", { status: init.method === "POST" ? serverStatus : 200 }); };

let fallos = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "OK   " : "FALLA", m); if (!c) fallos++; };

(async () => {
  const m = await import("../src/lib/native-push");
  ok(m.nativePushAvailable() === true, "detecta el plugin y la plataforma");

  permission = "denied";
  let r = await m.enableNativePush("user-A");
  ok(!r.ok && (r as any).reason === "denied" && calls.length === 0, "permiso negado: no registra nada");

  permission = "granted"; serverStatus = 503;
  r = await m.enableNativePush("user-A");
  ok(!r.ok && (r as any).reason === "server" && !m.nativePushEnabledFor("user-A"), "servidor sin migracion 110 (503): avisa y no queda activado");

  serverStatus = 200; calls.length = 0;
  r = await m.enableNativePush("user-A");
  ok(r.ok && m.nativePushEnabledFor("user-A"), "activa: queda activado para esa persona");
  ok(calls[0].method === "POST" && calls[0].body.platform === "ios" && calls[0].body.token === "token-del-telefono-0000000001", "envia token y plataforma al servidor");
  ok(m.nativePushEnabledFor("user-B") === false, "otra persona en el mismo telefono NO queda activada");

  calls.length = 0;
  await m.syncNativePush("user-B");
  ok(calls.length === 0 && !listeners.tokenReceived, "sync de otra persona no registra ni escucha");

  await m.syncNativePush("user-A");
  ok(!!listeners.tokenReceived && !!listeners.notificationActionPerformed, "sync de la persona activa deja los dos escuchadores");
  listeners.notificationActionPerformed({ notification: { data: { url: "/dashboard/mi-agenda" } } });
  ok(g.window.location.href === "/dashboard/mi-agenda", "tocar un aviso abre la pantalla indicada");
  g.window.location.href = "/dashboard";
  listeners.notificationActionPerformed({ notification: { data: { url: "https://sitio-malo.com" } } });
  listeners.notificationActionPerformed({ notification: { data: { url: "//sitio-malo.com" } } });
  ok(g.window.location.href === "/dashboard", "ignora direcciones externas");

  calls.length = 0;
  await m.disableNativePush();
  ok(calls.length === 1 && calls[0].method === "DELETE" && calls[0].body.token === "token-del-telefono-0000000001", "apagar: borra el token en el servidor");
  ok(m.nativePushEnabledFor("user-A") === false, "apagar: queda desactivado localmente");

  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLAS`);
  process.exit(fallos === 0 ? 0 : 1);
})();
