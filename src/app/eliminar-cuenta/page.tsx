// Pagina publica "Eliminar mi cuenta". Google Play exige una direccion web donde explicar como pedir la
// eliminacion de la cuenta sin abrir la app. El correo de soporte sale de NEXT_PUBLIC_SUPPORT_EMAIL (Vercel).

export const metadata = { title: "Eliminar mi cuenta - re-booking" };

export default function EliminarCuentaPage() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6 text-brand-dark">
      <h1 className="text-2xl font-bold">Eliminar mi cuenta de re-booking</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Desde la app o la web</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Inicia sesión en re-booking.</li>
          <li>Abre <strong>Mi Perfil</strong> (menú ☰, opción &quot;Mi Perfil&quot;).</li>
          <li>Al final de la página pulsa <strong>Eliminar mi cuenta</strong> y confirma con tu contraseña.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Qué se elimina y qué se conserva</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Se cierra tu acceso y se borran tus datos personales del perfil: nombre, correo, teléfono, foto y avisos al celular.</li>
          <li>Las citas, ventas y registros contables pertenecen al negocio donde trabajas y deben conservarse; quedan sin tus datos, como &quot;Cuenta eliminada&quot;.</li>
          <li>Si eres el único administrador de un negocio, primero debes agregar otro administrador o pedir el cierre del negocio a soporte.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">¿No puedes entrar a tu cuenta?</h2>
        <p className="text-sm">
          {support ? (
            <>Escríbenos a <a className="underline" href={`mailto:${support}`}>{support}</a> desde el correo de tu cuenta y la eliminaremos.</>
          ) : (
            <>Pide la eliminación al administrador de tu negocio o a soporte de re-booking.</>
          )}
        </p>
        <p className="text-sm text-brand-gray">
          Si eres cliente de un negocio (no personal que usa re-booking) y quieres que borren tus datos, pídelo directamente al negocio donde agendaste.
        </p>
      </section>
    </main>
  );
}
