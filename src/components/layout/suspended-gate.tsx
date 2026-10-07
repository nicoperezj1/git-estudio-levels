"use client";

import { usePathname } from "next/navigation";
import { useIsNativeApp } from "@/lib/native-app";

// Bloquea el uso del panel cuando el negocio esta suspendido por falta de pago.
// Solo deja abierta la pantalla de "Plan y facturacion" para que el administrador regularice.
export function SuspendedGate({
  suspended,
  isAdmin,
  children,
}: {
  suspended: boolean;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inApp = useIsNativeApp();

  if (!suspended || pathname?.startsWith("/dashboard/configuracion/facturacion")) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="max-w-md w-full text-center bg-white dark:bg-gray-900 border border-red-200 rounded-2xl p-8 shadow-sm">
        <div className="text-4xl mb-3">⛔</div>
        <h1 className="text-xl font-bold text-brand-dark dark:text-white">Cuenta suspendida</h1>
        <p className="text-sm text-brand-gray mt-2">
          Suspendimos el acceso de este negocio porque no pudimos cobrar la suscripción. Tus datos están a salvo:
          apenas se regularice el pago, todo vuelve a funcionar.
        </p>
        {isAdmin && !inApp ? (
          <a
            href="/dashboard/configuracion/facturacion"
            className="inline-block mt-6 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700"
          >
            Ir a Plan y facturación
          </a>
        ) : (
          <p className="text-sm text-brand-gray mt-6">Avisa al administrador de tu negocio para que regularice el pago.</p>
        )}
      </div>
    </div>
  );
}
