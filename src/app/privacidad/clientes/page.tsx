import Link from "next/link";
import { notFound } from "next/navigation";

// Politica de Privacidad de re-booking (Ley 19.628; Ley 21.719 desde el 1 dic. 2026). Es publica por defecto: las tiendas de apps
// (Google Play y App Store) exigen una URL. Para ocultarla de nuevo, poner NEXT_PUBLIC_LEGAL_PAGES_ENABLED=0 en Vercel.
// Pendiente: revision de un abogado antes del 1 dic. 2026 (ver documentos legales en docs/legal y el borrador completo con notas).
export const dynamic = "force-dynamic";

const BOX = "text-sm leading-6 text-gray-700 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-gray-200 [&_h2]:pb-1 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-brand-dark [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-brand-dark [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_td]:align-top";

export default function PrivacidadClientesPage() {
  if (process.env.NEXT_PUBLIC_LEGAL_PAGES_ENABLED === "0") notFound();
  return (
    <div className="min-h-screen bg-white p-6 md:p-12 max-w-3xl mx-auto">
      <Link href="/landing" className="text-brand-blue text-sm hover:underline">← Volver</Link>
      <h1 className="text-2xl font-bold text-brand-dark mt-6 mb-1">Aviso de Privacidad para clientes de los negocios</h1>
      <p className="mb-4 text-sm"><Link href="/privacidad" className="text-brand-blue hover:underline">← Política de Privacidad de re-booking</Link></p>
      <div className={BOX}>
<p className="text-xs text-gray-500">Para personas que reservan una hora, se atienden o son registradas por un negocio que usa re-booking. Se muestra en la página de reservas y se enlaza en los correos.</p>

<h2>1. ¿Quién usa tus datos?</h2>
<p>El <b>negocio</b> donde reservas o te atiendes (por ejemplo, una barbería o un centro de kinesiología) es el <b>responsable</b> de tus datos: decide para qué se usan. re-booking es la plataforma tecnológica que el negocio utiliza y actúa como <b>encargado</b>: guarda y procesa tus datos solo por cuenta y según las instrucciones del negocio.</p>
<p><b>Negocio:</b> el nombre y los datos de contacto del negocio aparecen en su página de reservas. <b>Plataforma:</b> re-booking, operada por <b>RE-BOOKING SpA</b>, RUT <b>78.511.911-8</b>, con domicilio en Juan de Dios Malebrán 1889, Puente Alto.</p>

<h2>2. ¿Qué datos se guardan?</h2>
<ul>
<li><b>Los que entregas al reservar:</b> nombre, correo, teléfono, servicio, profesional, fecha y hora.</li>
<li><b>Los que el negocio agrega al atenderte:</b> historial de visitas y compras, notas, preferencias, puntos de fidelidad y, si corresponde, fotos o documentos.</li>
<li><b>Datos de salud:</b> re-booking no está diseñado para guardar información clínica (recetas, exámenes, fichas) y por ahora no permite subir esos documentos. Si un negocio de salud la registra por su cuenta, es responsabilidad del negocio, y solo debe hacerlo con tu consentimiento o cuando la ley lo permite.</li>
</ul>

<h2>3. ¿Para qué se usan?</h2>
<ul>
<li>Agendar, confirmar, recordar y cancelar tu hora.</li>
<li>Atenderte, cobrar y emitir la boleta.</li>
<li>Llevar el historial de tu atención.</li>
<li><b>Promociones y mensajes</b> del negocio: <b>solo si lo aceptas</b>. La casilla viene sin marcar. Puedes retirar tu aceptación cuando quieras.</li>
</ul>

<h2>4. ¿Quién más ve tus datos?</h2>
<p>El personal autorizado del negocio y los proveedores tecnológicos que hacen funcionar la plataforma (alojamiento, base de datos, correo y pagos), que solo los tratan por cuenta del negocio. Algunos están en el extranjero. <b>Tus datos no se venden ni se usan para publicidad de terceros.</b> Ver la lista completa en la Política de Privacidad de re-booking.</p>

<h2>5. ¿Cuánto tiempo?</h2>
<p>Mientras el negocio los necesite para atenderte o la ley lo exija. Las ventas y boletas se conservan <b>6 años</b>. Puedes pedir al negocio que elimine tus datos y, si corresponde, se hará salvo lo que la ley obligue a guardar.</p>

<h2>6. Tus derechos</h2>
<p>Puedes pedir <b>acceso, rectificación, supresión, oposición, portabilidad y bloqueo</b> de tus datos, y retirar tu consentimiento. Escribe al negocio o a <b>contactorebooking@gmail.com</b> y te ayudaremos a que tu solicitud llegue a quien corresponde y se responda en <b>30 días</b>. Si no estás conforme, puedes reclamar ante la <b>Agencia de Protección de Datos Personales</b>.</p>

<h2>7. Menores de edad</h2>
<p>Si eres menor de edad, tu reserva debe hacerla o autorizarla tu padre, madre o representante legal.</p>

<h2>8. Más información</h2>
<p>Política de Privacidad completa de re-booking: <b>www.re-booking.cl/privacidad</b>.</p>
      </div>
    </div>
  );
}
