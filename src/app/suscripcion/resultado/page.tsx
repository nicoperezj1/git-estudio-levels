"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SuscripcionResultadoPage() {
  const params = useSearchParams();
  // "result" lo pone re-booking en las back_urls del pago anual (Checkout Pro). El
  // regreso de una suscripcion mensual (Preapproval) no trae resultado: lo que manda es
  // el estado real en nuestra base de datos, que actualiza el webhook.
  const result = params.get("result");
  // Mercado Pago (suscripcion mensual) anexa "?preapproval_id=..." a la back_url con un
  // segundo "?" en vez de "&", asi que el valor de req puede venir con basura pegada.
  // Nos quedamos solo con el UUID.
  const reqRaw = params.get("req");
  const reqId = reqRaw?.match(/^[0-9a-fA-F-]{36}/)?.[0] ?? reqRaw;
  // MP agrega ?preapproval_id=... con un segundo "?" (queda dentro de "req"), asi que lo sacamos de ahi.
  const preapprovalId =
    params.get("preapproval_id") || reqRaw?.match(/preapproval_id=([0-9a-zA-Z]+)/)?.[1] || "";
  const [checking, setChecking] = useState(true);
  const [paid, setPaid] = useState(false);

  // El webhook suele llegar antes que el regreso del usuario, pero se consulta unos
  // segundos por si aun viene en camino. Se usa el estado real (signup_requests.status),
  // nunca solo lo que diga la URL.
  useEffect(() => {
    if (!reqId || result === "failure") {
      setChecking(false);
      return;
    }
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/checkout/subscribe/status?req=${reqId}${preapprovalId ? `&preapproval_id=${preapprovalId}` : ""}`);
        const data = await res.json();
        if (data.status === "paid") {
          setPaid(true);
          setChecking(false);
          clearInterval(interval);
          return;
        }
      } catch {}
      if (attempts >= 12) {
        setChecking(false);
        clearInterval(interval);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [result, reqId, preapprovalId]);

  const failed = result === "failure" && !paid;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl p-6 md:p-8 text-center">
        <img src="/logo-icon.png" alt="re-booking" className="w-14 h-14 mx-auto mb-4" />

        {paid && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-brand-dark">Cuenta creada</h2>
            <p className="text-sm text-brand-gray mt-2">
              Tu pago fue aprobado y tu cuenta ya está lista. Revisa tu email para tus datos de acceso.
            </p>
            <a
              href="/login"
              className="mt-5 inline-block w-full h-11 leading-[44px] rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 transition-all"
            >
              Ir a iniciar sesión
            </a>
          </>
        )}

        {!failed && !paid && checking && (
          <>
            <div className="text-4xl mb-3">⏳</div>
            <h2 className="text-lg font-bold text-brand-dark">Confirmando tu pago...</h2>
            <p className="text-sm text-brand-gray mt-2">Esto toma unos segundos, no cierres esta página.</p>
          </>
        )}

        {!failed && !paid && !checking && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-brand-dark">Estamos confirmando tu pago</h2>
            <p className="text-sm text-brand-gray mt-2">
              Apenas Mercado Pago lo confirme, crearemos tu cuenta y te llegara un email con tus datos de acceso. Puede tardar unos minutos.
            </p>
          </>
        )}

        {failed && (
          <>
            <div className="text-4xl mb-3">❌</div>
            <h2 className="text-lg font-bold text-brand-dark">El pago no se pudo procesar</h2>
            <p className="text-sm text-brand-gray mt-2">Puedes intentar de nuevo o contactarnos por WhatsApp.</p>
            <a
              href="/suscribirse"
              className="mt-5 inline-block w-full h-11 leading-[44px] rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-brand-blue/90 transition-all"
            >
              Intentar de nuevo
            </a>
          </>
        )}
      </div>
    </div>
  );
}
