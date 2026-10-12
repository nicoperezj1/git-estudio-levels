// Prueba de src/lib/fcm.ts sin red: llave RSA de mentira y fetch simulado. Ejecutar: npx tsx scripts/test-fcm.ts
import crypto from "crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  client_email: "test@proyecto-prueba.iam.gserviceaccount.com",
  project_id: "proyecto-prueba",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"),
});

const calls: { url: string; init: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ url, init });
  if (url.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "tok-falso", expires_in: 3600 }), { status: 200 });
  const body = JSON.parse(init.body);
  if (body.message.token === "token-muerto-0000000000") return new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), { status: 404 });
  return new Response(JSON.stringify({ name: "ok" }), { status: 200 });
};

let fallos = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "OK   " : "FALLA"), m); if (!c) fallos++; };

(async () => {
  const { sendFcm, fcmConfigured } = await import("../src/lib/fcm");
  ok(fcmConfigured() === true, "configurado cuando hay FIREBASE_SERVICE_ACCOUNT");
  const r = await sendFcm(["token-bueno-1111111111", "token-muerto-0000000000"], { title: "Nueva cita", body: "Ana - 15:30", url: "/dashboard/mi-agenda" });
  ok(r.sent === 1 && r.failed === 1, `1 enviado y 1 fallido (sent=${r.sent}, failed=${r.failed})`);
  ok(r.invalid.length === 1 && r.invalid[0] === "token-muerto-0000000000", "el token muerto queda marcado para borrar");

  const tokenCall = calls.find((c) => c.url.includes("oauth2"))!;
  const assertion = new URLSearchParams(tokenCall.init.body).get("assertion")!;
  const [h, c, sig] = assertion.split(".");
  const verifier = crypto.createVerify("RSA-SHA256"); verifier.update(`${h}.${c}`);
  const firmaValida = verifier.verify(publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  ok(firmaValida, "la firma del JWT es valida con la llave publica");
  const claims = JSON.parse(Buffer.from(c, "base64").toString());
  ok(claims.iss === "test@proyecto-prueba.iam.gserviceaccount.com" && claims.scope.includes("firebase.messaging"), "claims: emisor y permiso de mensajeria");

  const send = calls.filter((x) => x.url.includes("fcm.googleapis.com"));
  ok(send.length === 2 && send[0].url.includes("/projects/proyecto-prueba/messages:send"), "dos envios a la API v1 del proyecto");
  const m = JSON.parse(send[0].init.body).message;
  ok(m.notification.title === "Nueva cita" && m.data.url === "/dashboard/mi-agenda" && m.token === "token-bueno-1111111111", "mensaje con titulo, texto, destino y token");
  ok(send[0].init.headers.Authorization === "Bearer tok-falso", "usa el token de acceso");
  ok(calls.filter((x) => x.url.includes("oauth2")).length === 1, "el token de acceso se pide una sola vez (se reutiliza)");

  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLAS`);
  process.exit(fallos === 0 ? 0 : 1);
})();
