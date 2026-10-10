import Link from "next/link";
import { notFound } from "next/navigation";

// BORRADOR de la Política de Privacidad (Ley 21.719). Esta página NO es pública hasta que:
//   1) un abogado revise y apruebe el texto,
//   2) se completen los datos entre [corchetes] (razón social, RUT, correo de privacidad),
//   3) se active la variable de entorno NEXT_PUBLIC_LEGAL_PAGES_ENABLED=1 en Vercel.
// Mientras tanto responde 404. El texto de apoyo está en docs/legal/.
export const dynamic = "force-dynamic";

const SUBENCARGADOS = [
  { n: "Supabase", f: "Base de datos y autenticación", p: "Estados Unidos / región configurada en el proyecto" },
  { n: "Vercel", f: "Alojamiento de la aplicación web", p: "Estados Unidos" },
  { n: "Resend", f: "Envío de correos (recordatorios, boletas, avisos)", p: "Estados Unidos" },
  { n: "Mercado Pago", f: "Cobro de suscripciones y depósitos de reserva", p: "Chile / Argentina" },
  { n: "TUU", f: "Cobro con máquina de tarjetas (si el negocio la usa)", p: "Chile" },
  { n: "Google (Firebase Cloud Messaging)", f: "Avisos al celular de la app (cuando exista)", p: "Estados Unidos" },
  { n: "Apple (APNs)", f: "Avisos al iPhone de la app (cuando exista)", p: "Estados Unidos" },
];

export default function PrivacidadPage() {
  if (process.env.NEXT_PUBLIC_LEGAL_PAGES_ENABLED !== "1") notFound();
  return (
    <div className="min-h-screen bg-white p-6 md:p-12 max-w-3xl mx-auto">
      <Link href="/landing" className="text-brand-blue text-sm hover:underline">← Volver</Link>
      <h1 className="text-2xl font-bold text-brand-dark mt-6 mb-2">Política de Privacidad</h1>
      <p className="text-sm text-brand-gray mb-6">Última actualización: [fecha de publicación]</p>

      <div className="prose prose-sm text-gray-700 space-y-4">
        <h2 className="text-lg font-bold">1. Quiénes somos</h2>
        <p>re-booking es una plataforma de gestión de agenda, clientes, ventas y equipo para negocios de servicios. La opera [razón social], RUT [RUT], con domicilio en [dirección], Chile (en adelante, "re-booking"). Para consultas de privacidad escribe a [correo de privacidad].</p>

        <h2 className="text-lg font-bold">2. Dos papeles distintos</h2>
        <p><b>Como encargado:</b> cada negocio que usa re-booking (por ejemplo una barbería o un centro de kinesiología) decide qué datos de sus clientes y de su equipo guarda y para qué. re-booking los trata solo por cuenta y según las instrucciones de ese negocio, que es el responsable de esos datos. Si eres cliente de un negocio, para ejercer tus derechos sobre esos datos puedes dirigirte al negocio o a nosotros, y te ayudaremos a canalizar tu solicitud.</p>
        <p><b>Como responsable:</b> re-booking decide por sí misma el tratamiento de los datos de la cuenta del negocio, de la facturación de la suscripción, del uso de la plataforma y de los dispositivos y avisos de la aplicación.</p>

        <h2 className="text-lg font-bold">3. Qué datos tratamos y para qué</h2>
        <ul className="list-disc pl-5">
          <li><b>Equipo del negocio:</b> nombre, correo, rol, PIN personal, horarios, comisiones y, si el negocio lo activa, datos laborales y de remuneraciones. Para dar acceso y operar el negocio (ejecución del contrato; obligaciones laborales y tributarias del negocio).</li>
          <li><b>Clientes del negocio:</b> nombre, celular, correo, historial de citas y compras, notas, fotos y documentos que el negocio cargue, puntos de fidelidad. Para agendar, recordar, cobrar y atender (ejecución de la cita; consentimiento para promociones y mensajes de retención).</li>
          <li><b>Datos de salud:</b> en negocios de salud (por ejemplo kinesiología) el negocio puede registrar información clínica. Es un dato sensible: solo se trata con el consentimiento explícito del paciente o cuando la ley lo permite, y no se muestra en avisos ni exportaciones generales.</li>
          <li><b>Ventas y caja:</b> montos, medio de pago y quién emitió cada venta. No guardamos números de tarjeta: los procesan Mercado Pago y TUU.</li>
          <li><b>Dispositivo y avisos:</b> identificador del dispositivo, preferencias de notificación y horario de silencio, para enviarte avisos.</li>
          <li><b>Uso técnico:</b> registros de acceso y seguridad (por ejemplo inicios de sesión) para proteger las cuentas.</li>
        </ul>
        <p>No pedimos ubicación, contactos ni micrófono. No vendemos datos personales ni los usamos para publicidad de terceros.</p>

        <h2 className="text-lg font-bold">4. Con quién los compartimos</h2>
        <p>Usamos proveedores que tratan datos por nuestra cuenta (subencargados):</p>
        <ul className="list-disc pl-5">
          {SUBENCARGADOS.map((s) => (<li key={s.n}><b>{s.n}</b>: {s.f}. Ubicación: {s.p}.</li>))}
        </ul>
        <p>Algunos están fuera de Chile. Exigimos garantías adecuadas para estas transferencias internacionales. Solo entregamos datos a autoridades cuando la ley lo exige.</p>

        <h2 className="text-lg font-bold">5. Cuánto tiempo los conservamos</h2>
        <p>Los datos de cada negocio se conservan mientras su cuenta esté activa. Al cancelar la suscripción los mantenemos [30] días para que puedas exportarlos y luego los eliminamos, salvo lo que la ley obligue a guardar (por ejemplo documentos tributarios, [6] años). Cada negocio define cuánto conserva los datos de clientes inactivos.</p>

        <h2 className="text-lg font-bold">6. Seguridad</h2>
        <p>Aplicamos medidas técnicas y organizativas: acceso por sesión y por rol, separación de datos entre negocios, conexiones cifradas y registro de operaciones sensibles. Si ocurre una brecha que afecte tus datos, la informaremos a la Agencia de Protección de Datos Personales y, cuando corresponda, a las personas afectadas, sin dilación indebida.</p>

        <h2 className="text-lg font-bold">7. Tus derechos</h2>
        <p>Puedes pedir acceso a tus datos, rectificarlos, suprimirlos, oponerte a un tratamiento, solicitar su portabilidad y el bloqueo temporal, y retirar tu consentimiento cuando se haya usado como base. También puedes pedir que no se tomen decisiones sobre ti basadas únicamente en tratamiento automatizado. Si usas la app, puedes eliminar tu cuenta tú mismo desde Mi Perfil, opción "Eliminar mi cuenta" (más información en /eliminar-cuenta). Para el resto de tus derechos, escribe a [correo de privacidad] indicando tu nombre, tu correo o celular y qué quieres hacer; respondemos dentro del plazo legal. Si no estás conforme, puedes reclamar ante la Agencia de Protección de Datos Personales.</p>

        <h2 className="text-lg font-bold">8. Niñas, niños y adolescentes</h2>
        <p>Los menores de edad solo pueden usar el servicio a través de su padre, madre o representante legal, que debe dar la autorización cuando la ley lo exija. Los negocios no deben registrar datos de menores sin esa autorización.</p>

        <h2 className="text-lg font-bold">9. Cookies y almacenamiento local</h2>
        <p>Usamos cookies y almacenamiento del navegador estrictamente necesarios (sesión, tema, preferencias). No usamos cookies de publicidad.</p>

        <h2 className="text-lg font-bold">10. Cambios</h2>
        <p>Si cambiamos esta política de forma importante, te avisaremos en la plataforma o por correo antes de que rija.</p>

        <h2 className="text-lg font-bold">11. Contacto</h2>
        <p>[Nombre del delegado o responsable de privacidad], [correo de privacidad], [dirección].</p>
      </div>
    </div>
  );
}
