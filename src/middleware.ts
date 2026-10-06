import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas de API que un negocio suspendido SI puede usar: para pagar/reactivar, iniciar sesion,
// ver planes y los flujos publicos o de servidor a servidor (webhooks, cron, reservas de clientes).
const SUSPENDED_ALLOWED_API = [
  "/api/billing",
  "/api/checkout",
  "/api/plans",
  "/api/auth",
  "/api/cron",
  "/api/webhooks",
  "/api/mercadopago",
  "/api/public",
  "/api/booking",
  "/api/portal",
  "/api/cancel",
];

// Cache corta (por instancia) para no consultar la base en cada llamada.
const statusCache = new Map<string, { suspended: boolean; at: number }>();
const CACHE_MS = 15_000;

// true si quien llama es personal de un negocio SUSPENDIDO (nunca el super admin).
// Se usa getSession() (lee la cookie, sin red) porque solo sirve para DENEGAR: cada ruta de API
// sigue validando la sesion por su cuenta, asi que un token falso no gana nada aqui.
async function isSuspendedStaff(request: NextRequest): Promise<boolean> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    { cookies: { get: (name: string) => request.cookies.get(name)?.value, set() {}, remove() {} } }
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.suspended;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=role,tenant:tenants(status)`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const suspended = !!row && row.role !== "super_admin" && row.tenant?.status === "suspended";
    statusCache.set(userId, { suspended, at: Date.now() });
    return suspended;
  } catch {
    return false; // ante un fallo de la consulta no se bloquea a nadie por error
  }
}

// Paginas publicas que la app movil no muestra (presentacion, registro de negocios, planes).
const APP_HIDDEN_PAGES = ["/", "/landing", "/signup", "/registro", "/suscribirse"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // App movil (Capacitor): arranca en el login. En la web de siempre no cambia nada.
  if (
    (request.headers.get("user-agent") || "").includes("RebookingApp") &&
    APP_HIDDEN_PAGES.includes(pathname)
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Bloqueo en el servidor: un negocio suspendido no puede usar la API (salvo lo necesario para pagar).
  if (pathname.startsWith("/api/")) {
    if (SUSPENDED_ALLOWED_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next();
    }
    if (await isSuspendedStaff(request)) {
      return NextResponse.json(
        { error: "Tu cuenta está suspendida por falta de pago. Regulariza tu suscripción para seguir usando re-booking.", code: "tenant_suspended" },
        { status: 402 }
      );
    }
    return NextResponse.next();
  }

  // Normal auth middleware for dashboard/login
  if (pathname.startsWith("/dashboard") || pathname === "/login") {
    return await updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/landing", "/signup", "/registro", "/suscribirse", "/dashboard/:path*", "/login", "/api/:path*"],
};
