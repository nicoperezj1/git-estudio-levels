// Link personal corto:  re-booking.cl/<negocio>/<profesional>
//   e.g. re-booking.cl/estudiolevels/javier-garcia
// Antes esto redirigia a /booking?tenant=...&prof=..., y la barra de direcciones quedaba con
// el link largo y generico. Ahora se muestra directamente la pagina de agenda y el link corto
// se mantiene en la barra; la pagina de booking lee negocio y profesional desde la ruta.
export { default } from "@/app/booking/page";
