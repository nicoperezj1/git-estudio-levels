"use client";

import PosScreen from "@/components/pos/pos-screen";

// El Punto de Venta vive en un componente para poder usar EXACTAMENTE el mismo cobro en el Standby nuevo.
export default function POSPage() {
  return <PosScreen />;
}
