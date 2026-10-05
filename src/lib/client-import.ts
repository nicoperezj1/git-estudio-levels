// Lectura de archivos de clientes (CSV/Excel) para la importacion masiva.
// Tolera: separador coma, punto y coma, tabulador o ESPACIOS (columnas separadas por 2+ espacios, o un solo
// espacio entre Nombre/Correo/Telefono/RUT), (Excel en Chile guarda con ';'), comillas con
// comas adentro, BOM, saltos \r\n, tildes en los titulos, "Nombre" + "Apellido" en columnas
// separadas y celdas con el texto literal "null" que escriben algunos exportadores (Setmore).

export type ImportClient = { name: string; email: string | null; phone: string | null; rut?: string | null };

export type ParseResult = { clients: ImportClient[]; error?: string; totalRows: number; withoutName: number };

const clean = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return /^(null|undefined|n\/a|nan|-)$/i.test(s) ? "" : s;
};

const norm = (h: unknown) =>
  String(h ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Archivos de texto "separados por espacios" (sin coma, punto y coma ni tabulador). Devuelve null si no aplica. */
function parseSpaceSeparated(t: string): string[][] | null {
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const head = norm(lines[0]);
  if (!/nombre|name|cliente/.test(head) || !/correo|email|mail|telefono|fono|celular|phone|rut/.test(head)) return null;

  // Columnas separadas por 2 o mas espacios (alineadas): se corta ahi y listo.
  if (/\S {2,}\S/.test(lines[0])) return lines.map((l) => l.split(/ {2,}/).map((c) => c.trim()));

  // Un solo espacio entre todo: Nombre Correo Telefono RUT. Se reconoce por la forma de cada dato.
  const rutRe = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;
  const rows: string[][] = [["Nombre", "Correo", "Telefono", "RUT"]];
  for (const l of lines.slice(1)) {
    const tokens = l.split(/\s+/);
    const isData = (tk: string) => tk.includes("@") || /^\+?\d[\d-]*$/.test(tk);
    const firstData = tokens.findIndex(isData);
    const nameTokens = firstData === -1 ? tokens : tokens.slice(0, firstData);
    const rest = firstData === -1 ? [] : tokens.slice(firstData);
    const email = rest.find((tk) => tk.includes("@")) || "";
    const rut = rest.find((tk) => rutRe.test(tk)) || "";
    const phone = rest.filter((tk) => !tk.includes("@") && tk !== rut).join(" ");
    rows.push([nameTokens.join(" "), email, phone, rut]);
  }
  return rows;
}

/** Divide texto CSV en filas de celdas respetando comillas. */
export function parseCsvText(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] || "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  if (![";", "\t", ","].some((ch) => count(ch) > 0)) {
    const spaced = parseSpaceSeparated(t);
    if (spaced) return spaced;
  }
  const delim = [";", "\t", ","].sort((a, b) => count(b) - count(a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Normaliza un telefono: Excel a veces lo entrega como numero (56912345678 o 9.12345678e8). */
function cleanPhone(v: unknown): string {
  if (typeof v === "number" && isFinite(v)) return String(Math.round(v));
  let s = clean(v);
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = String(Math.round(Number(s)));
  // "+56" solo (sin numero) o basura muy corta no sirve como telefono.
  return s.replace(/\D/g, "").length < 8 ? "" : s;
}

/** Convierte una tabla (primera fila = titulos) en clientes. */
export function rowsToClients(table: unknown[][]): ParseResult {
  if (table.length < 2) return { clients: [], error: "El archivo no tiene filas de clientes (solo titulos o esta vacio).", totalRows: 0, withoutName: 0 };
  if (table[0].length === 1 && String(table[0][0] ?? "").trim().split(/\s+/).length >= 3) {
    return { clients: [], error: "No pude separar las columnas del archivo (parece una sola columna). Guardalo como CSV o Excel con una columna por dato: Nombre, Correo, Telefono y RUT.", totalRows: 0, withoutName: 0 };
  }
  const headers = table[0].map(norm);
  const find = (pred: (h: string) => boolean) => headers.findIndex(pred);

  const fullIdx = find((h) => h === "nombre" || h === "name" || h === "full name" || h === "nombre completo" || h === "cliente" || h === "nombres" || h === "nombre y apellido" || h === "nombre cliente");
  const firstIdx = find((h) => h === "first name" || h === "primer nombre" || h === "nombre" || h === "nombres");
  const lastIdx = find((h) => h === "last name" || h === "apellido" || h === "apellidos" || h === "primer apellido");
  const last2Idx = find((h) => h === "segundo apellido");
  const anyNameIdx = find((h) => h.includes("nombre") || h.includes("name"));
  const rutIdx = find((h) => h === "rut" || h === "run" || h === "rut cliente");
  const emailIdx = find((h) => h.includes("email") || h.includes("correo") || h.includes("mail"));
  const phoneIdx = find((h) => h.includes("telefono") || h.includes("phone") || h.includes("fono") || h.includes("celular") || h.includes("movil") || h.includes("mobile") || h.includes("whatsapp"));

  const baseNameIdx = firstIdx !== -1 ? firstIdx : fullIdx !== -1 ? fullIdx : anyNameIdx;
  if (baseNameIdx === -1) {
    return { clients: [], error: `No encontre una columna de nombre. Las columnas del archivo son: ${table[0].map((h) => String(h ?? "").trim()).filter(Boolean).join(", ")}. Renombra la columna a "Nombre".`, totalRows: table.length - 1, withoutName: 0 };
  }

  const clients: ImportClient[] = [];
  let withoutName = 0;
  for (const r of table.slice(1)) {
    const parts = [clean(r[baseNameIdx])];
    if (lastIdx !== -1) parts.push(clean(r[lastIdx]));
    if (last2Idx !== -1) parts.push(clean(r[last2Idx]));
    const name = parts.filter(Boolean).join(" ").trim();
    if (!name) { if (r.some((x) => clean(x))) withoutName++; continue; }
    clients.push({
      name,
      email: emailIdx !== -1 ? clean(r[emailIdx]).toLowerCase() || null : null,
      phone: phoneIdx !== -1 ? cleanPhone(r[phoneIdx]) || null : null,
      rut: rutIdx !== -1 ? clean(r[rutIdx]) || null : null,
    });
  }
  return { clients, totalRows: table.length - 1, withoutName };
}
