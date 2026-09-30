"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Smartphone, KeyRound, Link2 } from "lucide-react";

/**
 * Guía paso a paso para conectar una máquina Mercado Pago Point con re-booking.
 * Tres etapas: (1) crear la aplicación en Mercado Pago, (2) registrar la máquina
 * en re-booking, (3) activar el modo Punto de Venta en la máquina.
 * El avance se recuerda en el navegador (opcional; si falla, la guía funciona igual).
 */

const STORAGE_KEY = "rb_mp_guide_v1";
export const MP_DEVICE_PREFIX = "NEWLAND_N950__";

// Texto para pegar en el asistente de IA de Mercado Pago (Ayuda). Usa el Device ID real.
export function buildAssistantText(deviceId: string) {
  const id = deviceId?.trim() || `${MP_DEVICE_PREFIX}N950NXXXXXXXX`;
  return (
    `Hola, necesito activar el modo Punto de Venta (PDV) en mi terminal Point para integrarla con un sistema externo por API. ` +
    `El Device ID de mi terminal es ${id}. ` +
    `Por favor, activa el modo PDV en este dispositivo y confírmame cuando esté listo.`
  );
}

type Step = { title: string; body: React.ReactNode };
type Stage = { id: string; icon: React.ReactNode; title: string; subtitle: string; steps: Step[] };

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* sin portapapeles: el usuario puede seleccionar el texto */
        }
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-brand-dark hover:bg-gray-50"
    >
      {done ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {done ? "Copiado" : label}
    </button>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-blue underline">
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export default function MpSetupGuide({ onUseDeviceId }: { onUseDeviceId?: (deviceId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [serial, setSerial] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw));
    } catch {}
  }, []);

  const toggle = (key: string) => {
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // El serial se escribe sin espacios y en mayúsculas; el usuario suele copiar "S/N: xxxx".
  const cleanSerial = serial.replace(/^\s*(s\/n|sn|serie|serial)\s*[:.]?\s*/i, "").replace(/\s+/g, "").toUpperCase();
  const deviceId = cleanSerial ? (cleanSerial.startsWith("NEWLAND") ? cleanSerial : `${MP_DEVICE_PREFIX}${cleanSerial}`) : "";

  const stages: Stage[] = [
    {
      id: "a",
      icon: <KeyRound className="w-4 h-4" />,
      title: "1. Conectar tu cuenta",
      subtitle: "Crear la aplicación en Mercado Pago y copiar el Access Token",
      steps: [
        { title: "Entra a Mercado Pago Developers", body: <>Abre <Link href="https://www.mercadopago.cl/developers/panel/app">mercadopago.cl/developers/panel/app</Link> con la <b>misma cuenta</b> donde está asociada tu máquina Point (la del negocio).</> },
        { title: "Crea una aplicación", body: <>Pulsa <b>Crear aplicación</b>. Ponle un nombre que reconozcas, por ejemplo <i>«re-booking [nombre de tu negocio]»</i>. Si te pregunta el tipo de solución, elige <b>Pagos presenciales</b>.</> },
        { title: "Elige el producto Mercado Pago Point", body: <>En el panel de integración selecciona <b>Mercado Pago Point</b> (cobros con máquina) y confirma. No necesitas configurar webhooks para empezar.</> },
        { title: "Activa las credenciales de producción", body: <>En <b>Credenciales de producción</b> completa el rubro de tu negocio, acepta los términos y pulsa <b>Activar credenciales</b>. Sin este paso el token no cobra dinero real.</> },
        { title: "Copia el Access Token de producción", body: <>Cópialo completo (empieza con <code className="font-mono text-xs bg-gray-100 px-1 rounded">APP_USR-</code>). Es <b>secreto</b>: no lo compartas por WhatsApp ni lo saques en pantallazos. Solo necesitas el <b>Access Token</b>; la Public Key y el Client ID no se usan.</> },
        { title: "Pégalo en re-booking", body: <>Vuelve a esta página, pégalo en <b>Access Token (Producción)</b> y pulsa <b>Guardar Token</b>.</> },
      ],
    },
    {
      id: "b",
      icon: <Link2 className="w-4 h-4" />,
      title: "2. Registrar tu máquina",
      subtitle: "Armar el Device ID con el número de serie y añadir el terminal",
      steps: [
        {
          title: "Busca el número de serie (S/N) de la máquina",
          body: <>Está en la etiqueta trasera de la máquina, junto a <b>S/N</b>. Ejemplo de formato: <code className="font-mono text-xs bg-gray-100 px-1 rounded">N950NXXXXXXXX</code>.</>,
        },
        {
          title: "Genera tu Device ID",
          body: (
            <div className="space-y-2">
              <p>Escribe el S/N y te armamos el Device ID (el prefijo <code className="font-mono text-xs bg-gray-100 px-1 rounded">{MP_DEVICE_PREFIX}</code> ya va incluido):</p>
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="Ej: N950NXXXXXXXX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
              {deviceId && (
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100">
                  <code className="font-mono text-xs break-all flex-1 min-w-0">{deviceId}</code>
                  <CopyButton text={deviceId} />
                  {onUseDeviceId && (
                    <button
                      type="button"
                      onClick={() => onUseDeviceId(deviceId)}
                      className="px-2 py-1 rounded-lg bg-brand-blue text-white text-[11px] font-medium"
                    >
                      Usar en «Nuevo terminal»
                    </button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-brand-gray">Si tu modelo no es Newland N950, revisa el Device ID exacto en Mercado Pago (Tu negocio → Dispositivos).</p>
            </div>
          ),
        },
        { title: "Añade el terminal", body: <>Pulsa <b>+ Añadir terminal</b> más abajo, ponle un nombre (ej. <i>Caja principal</i>), pega el Device ID, elige <b>Tipo de cobro</b> (Todo / Solo servicios / Solo productos) y pulsa <b>Agregar</b>. Deja el Access Token del terminal vacío para usar el de tu cuenta.</> },
        { title: "Elige Mercado Pago como máquina activa", body: <>Arriba, en <b>Máquina activa para cobrar con tarjeta</b>, selecciona <b>MercadoPago</b>. Así el Punto de Venta cobra con esta máquina.</> },
      ],
    },
    {
      id: "c",
      icon: <Smartphone className="w-4 h-4" />,
      title: "3. Activar modo Punto de Venta",
      subtitle: "Dejar la máquina lista para recibir cobros desde re-booking",
      steps: [
        {
          title: "Pide la activación al asistente de Mercado Pago",
          body: (
            <div className="space-y-2">
              <p>En la ayuda de Mercado Pago abre el <b>asistente de IA</b> y envía este mensaje:</p>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs leading-relaxed">{buildAssistantText(deviceId)}</div>
              <CopyButton text={buildAssistantText(deviceId)} label="Copiar mensaje" />
              <p className="text-[11px] text-brand-gray">Espera la respuesta confirmando que el modo PDV quedó activo para tu dispositivo.</p>
            </div>
          ),
        },
        { title: "Cambia el modo en la máquina", body: <>En la máquina: <b>Configuración → Modo de vinculación → PUNTO DE VENTA</b>. Crea un <b>PIN</b> cuando lo pida y anótalo en un lugar seguro.</> },
        { title: "Actualiza y reinicia", body: <>Si la máquina ofrece <b>Actualizar dispositivo</b>, acéptalo. Luego apágala y vuelve a encenderla.</> },
        { title: "Espera 5 minutos y prueba", body: <>La activación puede tardar hasta 5 minutos. Haz un cobro de prueba pequeño desde el Punto de Venta de re-booking: la máquina debe mostrar el monto para pasar la tarjeta.</> },
      ],
    },
  ];

  const total = stages.reduce((n, s) => n + s.steps.length, 0);
  const completed = stages.reduce((n, s) => n + s.steps.filter((_, i) => done[`${s.id}${i}`]).length, 0);
  const stage = stages[stageIdx];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 md:p-5 text-left"
        aria-expanded={open}
      >
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-dark text-sm md:text-base">Guía: conecta tu máquina Mercado Pago</p>
          <p className="text-xs text-brand-gray">{completed} de {total} pasos · toma unos 10 minutos</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-brand-gray transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-5 space-y-4">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(completed / total) * 100}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {stages.map((s, i) => {
              const all = s.steps.every((_, k) => done[`${s.id}${k}`]);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStageIdx(i)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium text-center ${
                    i === stageIdx ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-brand-gray hover:bg-gray-50"
                  }`}
                >
                  {all ? <Check className="w-4 h-4 text-green-600" /> : s.icon}
                  <span className="leading-tight">{s.title}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-brand-gray">{stage.subtitle}</p>

          <ol className="space-y-3">
            {stage.steps.map((st, i) => {
              const key = `${stage.id}${i}`;
              return (
                <li key={key} className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-label={done[key] ? "Marcar como pendiente" : "Marcar como hecho"}
                    className={`mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                      done[key] ? "bg-green-600 border-green-600 text-white" : "border-gray-300 text-brand-gray"
                    }`}
                  >
                    {done[key] ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </button>
                  <div className="min-w-0 flex-1 text-sm text-brand-dark">
                    <p className={`font-semibold ${done[key] ? "line-through text-brand-gray" : ""}`}>{st.title}</p>
                    <div className="text-[13px] text-brand-gray mt-0.5 leading-relaxed">{st.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={stageIdx === 0}
              onClick={() => setStageIdx((i) => i - 1)}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-brand-gray disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={stageIdx === stages.length - 1}
              onClick={() => setStageIdx((i) => i + 1)}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
            >
              Siguiente etapa
            </button>
          </div>

          <div className="text-[11px] text-brand-gray bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
            <p className="font-semibold text-brand-dark">¿Algo no funciona?</p>
            <p>• «Terminal no encontrado»: revisa que el Device ID tenga el prefijo y el S/N completo, sin espacios.</p>
            <p>• La máquina no muestra el cobro: confirma que esté en modo PUNTO DE VENTA, con internet, y espera 5 minutos tras reiniciar.</p>
            <p>• Error de credenciales: repite el paso de activar credenciales de producción y pega de nuevo el Access Token.</p>
          </div>
        </div>
      )}
    </div>
  );
}
