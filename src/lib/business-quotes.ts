// Frases de libros de negocios para la "nota" del Dashboard (solo administradores).
// Son frases cortas, en español, adaptadas de los libros mas leidos del rubro; el autor y el
// libro se muestran siempre debajo. Para agregar mas, basta con sumar un objeto al arreglo:
// se incorporan solas a la rotacion (no hace falta tocar nada mas).

export interface BusinessQuote {
  text: string;
  author: string;
  book: string;
}

export const BUSINESS_QUOTES: BusinessQuote[] = [
  { text: "Las personas no compran lo que haces, compran el porqué lo haces.", author: "Simon Sinek", book: "Empieza por el porqué" },
  { text: "Los líderes comen al final.", author: "Simon Sinek", book: "Los líderes comen al final" },
  { text: "Empieza con el fin en mente.", author: "Stephen R. Covey", book: "Los 7 hábitos de la gente altamente efectiva" },
  { text: "Lo primero es lo primero.", author: "Stephen R. Covey", book: "Los 7 hábitos de la gente altamente efectiva" },
  { text: "Primero busca entender, después ser entendido.", author: "Stephen R. Covey", book: "Los 7 hábitos de la gente altamente efectiva" },
  { text: "Sinergia: el todo es más que la suma de sus partes.", author: "Stephen R. Covey", book: "Los 7 hábitos de la gente altamente efectiva" },
  { text: "Afila la sierra.", author: "Stephen R. Covey", book: "Los 7 hábitos de la gente altamente efectiva" },
  { text: "Interésate sinceramente por los demás.", author: "Dale Carnegie", book: "Cómo ganar amigos e influir sobre las personas" },
  { text: "Todo lo que la mente puede concebir y creer, puede lograrse.", author: "Napoleon Hill", book: "Piense y hágase rico" },
  { text: "No te elevas al nivel de tus metas: caes al nivel de tus sistemas.", author: "James Clear", book: "Hábitos atómicos" },
  { text: "Cada acción es un voto por el tipo de persona que quieres ser.", author: "James Clear", book: "Hábitos atómicos" },
  { text: "Construir, medir, aprender.", author: "Eric Ries", book: "El método Lean Startup" },
  { text: "Lo bueno es enemigo de lo excelente.", author: "Jim Collins", book: "Empresas que sobresalen (Good to Great)" },
  { text: "Primero las personas correctas, después el rumbo.", author: "Jim Collins", book: "Empresas que sobresalen (Good to Great)" },
  { text: "Enfrenta los hechos brutales, sin perder la fe.", author: "Jim Collins", book: "Empresas que sobresalen (Good to Great)" },
  { text: "Cuida a las personas, los productos y las ganancias, en ese orden.", author: "Ben Horowitz", book: "Lo difícil de las cosas difíciles" },
  { text: "No trabajes solo por dinero: haz que el dinero trabaje para ti.", author: "Robert Kiyosaki", book: "Padre Rico, Padre Pobre" },
  { text: "Lo que haces es infinitamente más importante que cómo lo haces.", author: "Tim Ferriss", book: "La semana laboral de 4 horas" },
  { text: "Dolor + reflexión = progreso.", author: "Ray Dalio", book: "Principios" },
  { text: "La gente como nosotros hace cosas como estas.", author: "Seth Godin", book: "Esto es marketing" },
  { text: "El «no» es el comienzo de la negociación, no el final.", author: "Chris Voss", book: "Rompe la barrera del no" },
  { text: "Trabaja en tu negocio, no solo dentro de él.", author: "Michael E. Gerber", book: "El mito del emprendedor" },
  { text: "Solo los paranoicos sobreviven.", author: "Andy Grove", book: "Solo los paranoicos sobreviven" },
  { text: "Si no es un sí rotundo, es un no.", author: "Greg McKeown", book: "Esencialismo" },
  { text: "El obstáculo es el camino.", author: "Ryan Holiday", book: "El obstáculo es el camino" },
  { text: "El ego es el enemigo.", author: "Ryan Holiday", book: "El ego es el enemigo" },
  { text: "El esfuerzo cuenta dos veces.", author: "Angela Duckworth", book: "Grit: el poder de la pasión y la perseverancia" },
  { text: "El trabajo profundo es cada vez más raro, y cada vez más valioso.", author: "Cal Newport", book: "Deep Work" },
  { text: "Preocúpate personalmente y desafía directamente.", author: "Kim Scott", book: "Radical Candor" },
];
