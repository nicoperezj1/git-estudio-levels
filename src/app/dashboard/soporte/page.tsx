"use client";

import { LifeBuoy } from "lucide-react";
import { PageHeader, Panel, IconTile } from "@/components/ui/premium";
import { SupportForm } from "@/components/support/support-form";

export default function SoportePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 md:space-y-6 md:p-8 animate-fade-in">
      <PageHeader title="Ayuda y soporte" subtitle="¿Algo no funciona como esperabas? Cuéntanos y lo resolvemos." />
      <div className="flex items-center gap-3 rounded-2xl border border-brand-blue/20 bg-brand-blue/[0.06] p-4">
        <IconTile Icon={LifeBuoy} tone="teal" size={40} />
        <p className="text-sm text-brand-dark">
          Respondemos <strong>en menos de 48 horas</strong> y te contactamos por <strong>WhatsApp</strong>. Cada caso tiene su número.
        </p>
      </div>
      <Panel title="Nuevo caso">
        <SupportForm />
      </Panel>
    </div>
  );
}
