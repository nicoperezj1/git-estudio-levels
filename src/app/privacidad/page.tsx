import Link from "next/link";
import { notFound } from "next/navigation";

// Politica de Privacidad de re-booking (Ley 19.628; Ley 21.719 desde el 1 dic. 2026). Es publica por defecto: las tiendas de apps
// (Google Play y App Store) exigen una URL. Para ocultarla de nuevo, poner NEXT_PUBLIC_LEGAL_PAGES_ENABLED=0 en Vercel.
// Pendiente: revision de un abogado antes del 1 dic. 2026 (ver documentos legales en docs/legal y el borrador completo con notas).
export const dynamic = "force-dynamic";

const BOX = "text-sm leading-6 text-gray-700 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-gray-200 [&_h2]:pb-1 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-brand-dark [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-brand-dark [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_td]:align-top";

export default function PrivacidadPage() {
  if (process.env.NEXT_PUBLIC_LEGAL_PAGES_ENABLED === "0") notFound();
  return (
    <div className="min-h-screen bg-white p-6 md:p-12 max-w-3xl mx-auto">
      <Link href="/landing" className="text-brand-blue text-sm hover:underline">← Volver</Link>
      <h1 className="text-2xl font-bold text-brand-dark mt-6 mb-1">Política de Privacidad</h1>
      <p className="mb-4 text-sm"><Link href="/privacidad/clientes" className="text-brand-blue hover:underline">Aviso de privacidad para clientes de los negocios →</Link></p>
      <div className={BOX}>
<p className="text-xs text-gray-500">Última actualización: 13 de octubre de 2026 · Versión 1.0</p>

<h2>1. Introducción y a quién se aplica</h2>
<p>En re-booking nos tomamos en serio la privacidad. Esta Política explica qué datos personales tratamos, para qué, con qué fundamento, con quién los compartimos, cuánto tiempo los conservamos y cómo puedes ejercer tus derechos, de acuerdo con la legislación chilena de protección de datos personales (Ley N° 19.628 y, desde su entrada en vigencia, la Ley N° 21.719).</p>
<p>Se aplica a:</p>
<ul>
<li><b>Negocios</b> que contratan re-booking (barberías, salones, centros de estética, bienestar y salud) y sus <b>administradores</b>.</li>
<li><b>Equipo de esos negocios</b>: profesionales, recepción y demás personas con acceso a la plataforma.</li>
<li><b>Visitantes</b> de nuestro sitio web (www.re-booking.cl) y de la página de reservas.</li>
<li><b>Usuarios de las aplicaciones móviles</b> de re-booking para iPhone y Android.</li>
</ul>
<p>Si eres <b>cliente de un negocio</b> que usa re-booking (por ejemplo, reservaste una hora o te atiendes en una barbería), lee además el <b>Aviso de Privacidad para clientes de los negocios</b> (Parte 2), que explica tu situación en detalle.</p>
<p><b>Definiciones útiles.</b> <i>Dato personal</i>: información sobre una persona identificada o identificable. <i>Tratamiento</i>: cualquier operación sobre datos (recoger, guardar, usar, enviar, borrar). <i>Responsable</i>: quien decide para qué y cómo se tratan los datos. <i>Encargado</i>: quien trata datos por cuenta y según las instrucciones del responsable. <i>Titular</i>: la persona a quien se refieren los datos. <i>Dato sensible</i>: por ejemplo, datos de salud, biométricos o de menores en ciertos contextos.</p>

<h2>2. Quiénes somos</h2>
<p>re-booking es una plataforma de gestión de agenda, clientes, ventas, caja y equipo para negocios de servicios. La opera <b>RE-BOOKING SpA</b>, RUT <b>78.511.911-8</b>, con domicilio en Juan de Dios Malebrán 1889, Puente Alto, Chile (“re-booking”, “nosotros”).</p>
<p><b>Contacto de privacidad:</b> <b>contactorebooking@gmail.com</b> · Responsable de privacidad: <b>Nicolás Andrés Pérez Jaña</b>, representante de RE-BOOKING SpA.</p>


<h2>3. Dos papeles distintos: responsable y encargado</h2>
<p>re-booking cumple dos roles diferentes según los datos de que se trate. Esto es importante para saber ante quién ejerces tus derechos.</p>
<table>
<tr><th>Datos</th><th>Quién decide para qué se usan</th><th>Papel de re-booking</th></tr>
<tr><td><b>Datos de los clientes de cada negocio</b> (nombre, teléfono, correo, citas, compras, notas, fotos, documentos, puntos de fidelidad)</td><td>Cada <b>negocio</b></td><td><b>Encargado</b>: los tratamos solo por cuenta y según las instrucciones del negocio.</td></tr>
<tr><td><b>Datos del equipo del negocio</b> (profesionales, recepción) para operar el negocio: horarios, comisiones, ventas por profesional, remuneraciones si el negocio lo activa</td><td>Cada <b>negocio</b></td><td><b>Encargado</b></td></tr>
<tr><td><b>Cuenta y acceso a la plataforma</b>: correo, clave, rol, PIN, sesiones, registros de seguridad</td><td><b>re-booking</b> (y el negocio respecto de su equipo)</td><td><b>Responsable</b> (para seguridad y acceso) y encargado (para los datos del equipo)</td></tr>
<tr><td><b>Suscripción y facturación</b> del negocio: nombre del contacto, correo, plan, pagos</td><td><b>re-booking</b></td><td><b>Responsable</b></td></tr>
<tr><td><b>Dispositivos y avisos</b> de la app móvil: identificador del dispositivo, preferencias de notificación</td><td><b>re-booking</b></td><td><b>Responsable</b></td></tr>
<tr><td><b>Soporte y contacto</b> con re-booking</td><td><b>re-booking</b></td><td><b>Responsable</b></td></tr>
<tr><td><b>Visitantes del sitio web</b>: datos técnicos y cookies necesarias</td><td><b>re-booking</b></td><td><b>Responsable</b></td></tr>
</table>
<p><b>Si eres cliente de un negocio:</b> el responsable de tus datos es el negocio. Para ejercer tus derechos sobre esos datos puedes dirigirte al negocio o a nosotros; si nos escribes, canalizaremos tu solicitud al negocio y te ayudaremos a que se resuelva dentro de plazo.</p>

<h2>4. Qué datos tratamos</h2>
<h3>4.1 Datos que tú nos entregas</h3>
<table>
<tr><th>Categoría</th><th>Datos</th><th>Titulares</th></tr>
<tr><td>Identificación y contacto</td><td>Nombre, apellidos, correo electrónico, teléfono, RUT (solo si el negocio lo usa para boletas o remuneraciones)</td><td>Administradores, equipo, clientes</td></tr>
<tr><td>Perfil profesional (opcional)</td><td>Foto, biografía, Instagram, especialidades, años de experiencia, enlace de agenda</td><td>Profesionales</td></tr>
<tr><td>Agenda y reservas</td><td>Servicio, profesional, fecha y hora, estado de la cita, notas de la cita</td><td>Clientes, profesionales</td></tr>
<tr><td>Ficha del cliente</td><td>Notas, etiquetas de perfil, preferencias, fotos y documentos que el negocio cargue, historial de visitas, puntos de fidelidad, consentimiento para promociones</td><td>Clientes</td></tr>
<tr><td>Ventas y caja</td><td>Servicios y productos vendidos, montos, descuentos, medio de pago, quién emitió la venta, boletas</td><td>Clientes, equipo</td></tr>
<tr><td>Equipo y pagos al equipo</td><td>Rol, horarios, vacaciones, comisiones, arriendo de sillón, y, si el negocio activa remuneraciones, datos laborales y previsionales</td><td>Equipo</td></tr>
<tr><td>Suscripción del negocio</td><td>Datos de contacto, plan, estado de pago. <b>No guardamos números de tarjeta</b>: los procesa Mercado Pago.</td><td>Administradores</td></tr>
<tr><td>Soporte</td><td>Mensajes que nos envías y su contenido</td><td>Administradores, equipo</td></tr>
</table>

<h3>4.2 Datos que se generan al usar el servicio</h3>
<ul>
<li><b>Cuenta y seguridad:</b> inicios de sesión, sesiones activas, registros de operaciones sensibles (apertura y cierre de caja, descuentos, cambios de plan), dirección IP aproximada.</li>
<li><b>Dispositivo y avisos (app móvil):</b> identificador (token) que Google o Apple asignan a tu teléfono para enviarte notificaciones, la plataforma (iPhone o Android), tus preferencias de aviso y horario de silencio.</li>
<li><b>Datos técnicos del sitio:</b> tipo de navegador, páginas visitadas y errores, solo para el funcionamiento y la seguridad del servicio.</li>
</ul>

<h3>4.3 Lo que no hacemos</h3>
<ul>
<li>No pedimos tu <b>ubicación</b>, tus <b>contactos</b> ni el <b>micrófono</b>.</li>
<li>No <b>vendemos</b> datos personales.</li>
<li>No usamos tus datos para <b>publicidad de terceros</b> ni incluimos redes publicitarias en la app.</li>
<li>No tomamos <b>decisiones que te afecten</b> basadas únicamente en tratamiento automatizado.</li>
</ul>

<h2>5. Datos sensibles</h2>
<h3>5.1 Datos de salud</h3>
<p><b>Importante:</b> re-booking <b>no está diseñado para guardar información clínica</b>. Por ahora la plataforma no permite subir recetas médicas, exámenes ni fichas clínicas, y los negocios no deben registrar diagnósticos ni resultados en las notas. Si esto cambia en el futuro, actualizaremos esta política y pediremos los consentimientos que correspondan.</p>
<p>Algunos negocios que usan re-booking prestan servicios de salud (por ejemplo, kinesiología) y pueden registrar información sobre sus pacientes, como notas de atención o fotos. Estos son <b>datos sensibles</b>. Respecto de ellos:</p>
<ul>
<li>El <b>responsable</b> es el negocio o profesional que presta la atención; re-booking actúa como <b>encargado</b>.</li>
<li>Solo se tratan con el <b>consentimiento explícito</b> del paciente o cuando la ley lo permita o exija. Las fichas clínicas se rigen también por la Ley N° 20.584 sobre derechos y deberes de los pacientes, cuyas reglas de reserva y conservación el negocio debe cumplir.</li>
<li>No se incluyen en avisos al celular, correos ni exportaciones generales. Los avisos que llegan a la pantalla bloqueada pueden configurarse sin detalles.</li>
<li>Las fotos nuevas de clientes se guardan en un <b>almacén privado</b> y se muestran mediante enlaces temporales; estamos migrando las anteriores.</li>
<li>re-booking <b>no es una ficha clínica electrónica certificada</b> ni sustituye las obligaciones del prestador de salud. Los negocios no deben usarlo como único registro clínico.</li>
</ul>
<h3>5.2 Datos biométricos</h3>
<p>Si activas el bloqueo con <b>Face ID o huella</b> en la app, la verificación ocurre <b>dentro de tu teléfono</b> mediante el sistema de iPhone o Android. re-booking <b>no recibe ni guarda</b> tu rostro ni tu huella; solo recibe la confirmación de que el sistema operativo te reconoció.</p>
<h3>5.3 Datos de menores de edad</h3>
<p>Ver la sección 14.</p>

<h2>6. Para qué usamos los datos y en qué nos basamos</h2>
<table>
<tr><th>Finalidad</th><th>Base de licitud</th></tr>
<tr><td>Crear y administrar tu cuenta, dar acceso a la plataforma y operar el servicio contratado (agenda, ventas, caja, equipo)</td><td>Ejecución del contrato</td></tr>
<tr><td>Procesar reservas, enviar confirmaciones y recordatorios de citas y emitir boletas</td><td>Ejecución del contrato / de la cita; interés legítimo</td></tr>
<tr><td>Cobrar la suscripción y depósitos de reserva</td><td>Ejecución del contrato; obligación legal tributaria</td></tr>
<tr><td>Enviar avisos al celular o por correo sobre citas, cancelaciones y operación (avisos “transaccionales”)</td><td>Ejecución del contrato; tu elección al activar los avisos</td></tr>
<tr><td>Seguridad: prevenir fraude y accesos indebidos, registro de operaciones sensibles, auditoría</td><td>Interés legítimo; obligación legal</td></tr>
<tr><td>Dar soporte y responder tus consultas</td><td>Ejecución del contrato; interés legítimo</td></tr>
<tr><td>Cumplir obligaciones legales (tributarias, contables, laborales del negocio) y atender requerimientos de autoridades</td><td>Obligación legal</td></tr>
<tr><td>Enviar <b>promociones y mensajes de retención</b> a clientes de un negocio</td><td><b>Consentimiento</b> de la persona (casilla sin marcar por defecto), que se puede retirar en cualquier momento</td></tr>
<tr><td>Mejorar el servicio con estadísticas agregadas y sin identificar a personas</td><td>Interés legítimo</td></tr>
<tr><td>Tratar datos de salud de pacientes</td><td>Consentimiento explícito o las excepciones que la ley permita</td></tr>
</table>

<h2>7. Comunicaciones: lo necesario y lo promocional</h2>
<ul>
<li><b>Mensajes necesarios</b> para el servicio (confirmación, recordatorio, cancelación, boleta, aviso de seguridad): se envían sin consentimiento adicional porque son parte del servicio.</li>
<li><b>Mensajes promocionales o de retención</b> (“te extrañamos”, cupones, novedades): solo a personas que <b>aceptaron</b> recibirlos. Cada mensaje trae una forma simple de darse de baja, y el negocio puede marcar a una persona como “no contactar”.</li>
<li>Rechazar mensajes promocionales <b>no afecta</b> el servicio principal.</li>
</ul>

<h2>8. Con quién compartimos los datos</h2>
<h3>8.1 Con el negocio</h3>
<p>Los datos de un cliente o del equipo son visibles para el negocio al que pertenecen, según el rol de cada persona (administrador, recepción, profesional). <b>Los datos de un negocio no son visibles para otros negocios.</b></p>
<h3>8.2 Con proveedores (subencargados)</h3>
<p>Usamos proveedores que tratan datos por nuestra cuenta y bajo nuestras instrucciones, para que la plataforma funcione:</p>
<table>
<tr><th>Proveedor</th><th>Para qué</th><th>Datos</th><th>Ubicación</th></tr>
<tr><td>Supabase</td><td>Base de datos, autenticación y almacenamiento de archivos</td><td>Todos los datos de la plataforma</td><td>Estados Unidos</td></tr>
<tr><td>Vercel</td><td>Alojamiento y entrega de la aplicación web</td><td>Datos técnicos y de tráfico</td><td>Estados Unidos</td></tr>
<tr><td>Resend</td><td>Envío de correos (confirmaciones, recordatorios, boletas, avisos)</td><td>Correo y contenido del mensaje</td><td>Estados Unidos</td></tr>
<tr><td>Mercado Pago</td><td>Cobro de suscripciones y depósitos de reserva</td><td>Datos de pago (los procesa directamente Mercado Pago)</td><td>Chile / Argentina</td></tr>
<tr><td>TUU</td><td>Cobro con máquina de tarjetas, solo si el negocio la usa</td><td>Monto y referencia del cobro</td><td>Chile</td></tr>
<tr><td>Google (Firebase Cloud Messaging)</td><td>Entrega de avisos al celular Android y iPhone</td><td>Token del dispositivo y texto del aviso</td><td>Estados Unidos</td></tr>
<tr><td>Apple (servicio de notificaciones push)</td><td>Entrega de avisos al iPhone</td><td>Token del dispositivo y texto del aviso</td><td>Estados Unidos</td></tr>
</table>
<p>Cuando un proveedor incorpora a otro, exigimos las mismas garantías. Podemos actualizar esta lista; los cambios relevantes se informarán.</p>
<h3>8.3 Con autoridades y otros</h3>
<p>Solo entregamos datos a autoridades cuando una ley u orden judicial lo exija, y a asesores profesionales sujetos a confidencialidad. En una eventual reorganización de nuestra empresa, los datos podrían traspasarse al sucesor, que quedará obligado por esta Política.</p>


<h2>9. Transferencias internacionales</h2>
<p>Algunos proveedores están fuera de Chile (principalmente Estados Unidos). Cuando transferimos datos al extranjero, lo hacemos con proveedores que ofrecen garantías adecuadas de protección y mediante cláusulas contractuales u otros mecanismos que la ley permita. Puedes pedir más información en <b>contactorebooking@gmail.com</b>.</p>

<h2>10. Cuánto tiempo conservamos los datos</h2>
<table>
<tr><th>Datos</th><th>Plazo</th></tr>
<tr><td>Datos de la cuenta y del negocio</td><td>Mientras la cuenta esté activa.</td></tr>
<tr><td>Tras cancelar la suscripción</td><td>Los mantenemos <b>30 días</b> para que el negocio pueda exportarlos y luego los eliminamos o anonimizamos, salvo lo que la ley obligue a conservar.</td></tr>
<tr><td>Ventas, boletas y documentos tributarios</td><td><b>6 años</b> (obligación tributaria).</td></tr>
<tr><td>Datos de clientes inactivos</td><td>Los define cada negocio; sugerimos no más de <b>24 meses</b> sin actividad.</td></tr>
<tr><td>Fichas con datos de salud</td><td>Según la normativa sanitaria aplicable al prestador (por ejemplo, Ley N° 20.584 y su reglamento).</td></tr>
<tr><td>Registros de seguridad y auditoría</td><td><b>12</b> meses.</td></tr>
<tr><td>Token del dispositivo (avisos)</td><td>Hasta que cierres sesión, apagues los avisos o elimines tu cuenta.</td></tr>
<tr><td>Copias de seguridad</td><td>Rotan automáticamente y las copias antiguas se eliminan.</td></tr>
<tr><td>Mensajes de soporte</td><td><b>24</b> meses.</td></tr>
</table>
<p><b>Si eliminas tu cuenta</b> (Mi Perfil → “Eliminar mi cuenta”), cerramos tu acceso y anonimizamos tus datos personales del perfil. Los registros del negocio (citas, ventas, libro contable) <b>no se borran</b>, porque pertenecen al negocio y deben conservarse; quedan asociados a “Cuenta eliminada”.</p>

<h2>11. Seguridad</h2>
<p>Aplicamos medidas técnicas y organizativas razonables para proteger los datos, entre ellas:</p>
<ul>
<li>Comunicaciones <b>cifradas</b> (HTTPS) entre tu dispositivo y la plataforma.</li>
<li><b>Acceso por sesión y por rol</b>: cada persona ve solo lo que su rol permite, y los datos de cada negocio están <b>separados</b> de los de otros negocios.</li>
<li>Claves de acceso gestionadas por el servicio de autenticación del proveedor.</li>
<li>Las fotos nuevas de clientes se guardan en un <b>almacén privado</b> con enlaces temporales; estamos migrando las anteriores.</li>
<li><b>Registro de auditoría</b> de operaciones sensibles (caja, descuentos, cambios de plan, accesos).</li>
<li>Copias de seguridad automáticas.</li>
<li>Bloqueo opcional de la app con Face ID o huella.</li>
<li>Confidencialidad y acceso mínimo para el personal de re-booking.</li>
</ul>
<p>Ningún sistema es 100% seguro. Te recomendamos usar una clave larga y propia, no compartir tu PIN y cerrar sesión en dispositivos ajenos.</p>

<h2>12. Incidentes de seguridad</h2>
<p>Si ocurre una brecha que afecte datos personales, la investigaremos y contendremos de inmediato. Cuando corresponda, la informaremos <b>sin dilación indebida</b> a la Agencia de Protección de Datos Personales, al negocio responsable de los datos y a las personas afectadas, indicando qué ocurrió, qué datos están involucrados y qué puedes hacer.</p>

<h2>13. Tus derechos y cómo ejercerlos</h2>
<p>Como titular de datos personales puedes:</p>
<ul>
<li><b>Acceso:</b> saber qué datos tuyos tratamos y recibir una copia.</li>
<li><b>Rectificación:</b> corregir datos inexactos o incompletos.</li>
<li><b>Supresión:</b> pedir que eliminemos tus datos cuando ya no sean necesarios o retires tu consentimiento, salvo que la ley obligue a conservarlos.</li>
<li><b>Oposición:</b> oponerte a un tratamiento, en particular al uso con fines promocionales.</li>
<li><b>Portabilidad:</b> recibir tus datos en un formato estructurado y de uso común.</li>
<li><b>Bloqueo temporal:</b> pedir que se suspenda el uso de tus datos mientras se resuelve una solicitud.</li>
<li><b>Revocar tu consentimiento</b> en cualquier momento, sin efecto retroactivo.</li>
<li><b>No ser objeto de decisiones</b> basadas únicamente en tratamiento automatizado que te afecten significativamente.</li>
</ul>
<p><b>Cómo:</b> escribe a <b>contactorebooking@gmail.com</b> indicando tu nombre, el correo o celular con que usas el servicio, el negocio al que te refieres (si corresponde) y qué quieres hacer. Si usas la app, puedes <b>eliminar tu cuenta</b> tú mismo desde <i>Mi Perfil → Eliminar mi cuenta</i> y encontrarás instrucciones en <b>www.re-booking.cl/eliminar-cuenta</b>.</p>
<p><b>Verificación:</b> podemos pedirte información adicional para confirmar que eres tú. No entregamos datos a quien no podamos identificar.</p>
<p><b>Plazo:</b> respondemos dentro de <b>30 días corridos</b> desde que recibimos tu solicitud completa. Si los datos son de un negocio, le informaremos y coordinaremos la respuesta.</p>
<p><b>Reclamo:</b> si no quedas conforme, puedes reclamar ante la <b>Agencia de Protección de Datos Personales</b>.</p>

<h2>14. Niñas, niños y adolescentes</h2>
<p>re-booking es una herramienta de trabajo dirigida a <b>personas mayores de 18 años</b>. Los menores de edad solo pueden ser clientes de un negocio a través de su padre, madre o representante legal, que debe dar la autorización cuando la ley la exija. Los negocios no deben registrar datos de menores sin esa autorización, y los datos sensibles de menores requieren especial resguardo. Si crees que un menor nos entregó datos sin autorización, escríbenos y los eliminaremos.</p>

<h2>15. Cookies y almacenamiento local</h2>
<p>Usamos solo lo <b>estrictamente necesario</b> para que el servicio funcione:</p>
<table>
<tr><th>Elemento</th><th>Para qué</th><th>Duración</th></tr>
<tr><td>Cookies de sesión (autenticación)</td><td>Mantener tu sesión iniciada y proteger tu cuenta</td><td>Mientras dura la sesión</td></tr>
<tr><td>Almacenamiento local del navegador o app</td><td>Recordar tu tema (claro/oscuro), filtros, atajos de la barra inferior y si activaste los avisos en el teléfono</td><td>Hasta que lo borres</td></tr>
</table>
<p><b>No usamos</b> cookies de publicidad ni de seguimiento entre sitios. Puedes borrar las cookies desde tu navegador, aunque eso cerrará tu sesión.</p>

<h2>16. Aplicaciones móviles (iPhone y Android)</h2>
<ul>
<li><b>Notificaciones:</b> la app te pide permiso para enviarte avisos (citas nuevas, cancelaciones, cliente llegó). Puedes aceptar o rechazar, y cambiarlo en <i>Mi Perfil → Avisos en este teléfono</i> o en los ajustes del teléfono.</li>
<li><b>Cámara y fotos:</b> solo si decides subir una foto de perfil o de un cliente.</li>
<li><b>Face ID / huella:</b> opcional; ver sección 5.2.</li>
<li><b>Sin publicidad y sin rastreo:</b> la app no incluye redes publicitarias ni analítica de terceros con fines de marketing.</li>
<li>Las tiendas (Google Play y App Store) tratan datos propios según sus políticas, como responsables independientes.</li>
</ul>

<h2>17. Enlaces a otros sitios</h2>
<p>Podemos enlazar a sitios de terceros (por ejemplo, redes sociales de un profesional o WhatsApp). No controlamos su contenido ni sus políticas de privacidad.</p>

<h2>18. Cambios a esta Política</h2>
<p>Podemos actualizar esta Política. Si el cambio es importante, te avisaremos en la plataforma o por correo con anticipación razonable. La fecha de “última actualización” aparece al inicio.</p>

<h2>19. Contacto</h2>
<p><b>RE-BOOKING SpA</b> · RUT <b>78.511.911-8</b> · Juan de Dios Malebrán 1889, Puente Alto, Chile · <b>contactorebooking@gmail.com</b></p>
      </div>
    </div>
  );
}
