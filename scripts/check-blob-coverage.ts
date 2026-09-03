/**
 * Falla si el esquema tiene una columna que podría guardar una URL de archivo
 * y `collectReferencedPathnames()` no la mira.
 *
 * POR QUÉ EXISTE, con nombre y apellido: la sección Canciones agregó el modelo
 * `InspirationLink` con una columna `audioUrl`, y nadie la sumó a la
 * detección. La primera auditoría real sobre producción marcó 4 canciones EN
 * USO como huérfanas — la limpieza las habría borrado sin decir nada. Había un
 * comentario en CLAUDE.md avisando justamente de esto, y no alcanzó: un
 * comentario no corre.
 *
 * No adivina. Cada columna sospechosa tiene que estar en la detección o
 * declarada abajo como "no es un archivo". Una columna nueva no entra en
 * ninguna de las dos listas, así que rompe este chequeo y obliga a decidir.
 *
 *   npx tsx scripts/check-blob-coverage.ts
 *
 * No necesita credenciales: lee el schema y el script, nada más. Además
 * blob-cleanup.ts lo llama solo antes de borrar — la limpieza es manual, así
 * que este resguardo tiene que viajar con ella y no depender de que alguien
 * se acuerde de correrlo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

/** Columnas que el nombre hace sospechosas pero NO guardan una URL de
 * archivo. Cada una con su motivo — la lista es para leerla, no para crecer
 * sin pensar. */
const NO_SON_ARCHIVOS = new Set([
  "MoodboardElement.filename", // nombre original, para mostrar
  "ProposalMusicOption.audioName", // idem
  "GalleryPhoto.filename", // idem
  "InspirationPhoto.filename", // idem
  "InspirationLink.audioName", // idem
  "GalleryPhotoComment.photoId", // clave foránea; matchea por "photo"
  // Ruta INTERNA a la que lleva el click del aviso ("/?proposal=abc",
  // "/galeria"), nunca un archivo: la arma el server con postUrl() en
  // proposals-actions.ts, no sale de ninguna subida. Si algún día un aviso
  // guardara la URL de un archivo, esta línea hay que sacarla — el
  // recolector borraría ese archivo por no verlo referenciado.
  "Notification.url",
]);

/** Nombres que hacen sospechar que una columna guarda una URL. */
const SOSPECHOSO = /url|image|photo|video|audio|file|logo|background|src/i;

function columnasSospechosas(esquema: string): string[] {
  const encontradas: string[] = [];
  for (const m of esquema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, modelo, cuerpo] = m;
    for (const linea of cuerpo.split("\n")) {
      const t = linea.trim();
      if (!t || t.startsWith("///") || t.startsWith("@@")) continue;
      const campo = /^(\w+)\s+String(\[\])?\??/.exec(t);
      if (campo && SOSPECHOSO.test(campo[1])) encontradas.push(`${modelo}.${campo[1]}`);
    }
  }
  return encontradas;
}

/** Columnas que podrían guardar una URL de archivo y la detección no mira.
 * Vacío = todo cubierto. */
/** Los DOS lugares que tienen que conocer todas las columnas de URL.
 *
 * El segundo importa más que el primero: la auditoría que se olvida una
 * columna solo reporta de más, pero el recolector que se la olvida BORRA un
 * archivo que alguien está usando, en el momento y sin que nadie mire. */
const ARCHIVOS_QUE_DEBEN_CUBRIR = [
  "scripts/audit-blob-orphans.ts",
  "src/lib/dashboard/blob-gc.ts",
];

/** Columnas que podrían guardar una URL de archivo y alguno de los dos
 * archivos de arriba no mira. Vacío = todo cubierto. */
export function columnasSinCubrir(): string[] {
  const esquema = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
  const fuentes = ARCHIVOS_QUE_DEBEN_CUBRIR.map((f) => [f, readFileSync(join(RAIZ, f), "utf8")] as const);

  const sinCubrir: string[] = [];
  for (const columna of columnasSospechosas(esquema)) {
    if (NO_SON_ARCHIVOS.has(columna)) continue;

    const [modelo, campo] = columna.split(".");
    const prop = modelo[0].toLowerCase() + modelo.slice(1);
    for (const [nombre, fuente] of fuentes) {
      // `select:` puede venir en una línea o repartido en varias, de ahí el
      // [\s\S] en vez de un punto.
      const consulta = new RegExp(`prisma\\.${prop}\\.findMany\\(\\{[\\s\\S]{0,400}?select: \\{([\\s\\S]*?)\\}`).exec(fuente);
      if (!consulta || !consulta[1].includes(`${campo}:`)) sinCubrir.push(`${columna}  (falta en ${nombre})`);
    }
  }
  return sinCubrir;
}

/** Mensaje de error compartido, para que el script suelto y la limpieza digan
 * exactamente lo mismo. */
export function explicarSinCubrir(sinCubrir: string[]): string {
  return [
    "Hay columnas que podrían guardar una URL de archivo y la detección no mira:",
    "",
    ...sinCubrir.map((c) => `  ${c}`),
    "",
    "Agregalas donde falten — collectReferencedPathnames() en la auditoría y/o",
    "urlsTodaviaReferenciadas() en el recolector — o declaralas en",
    "NO_SON_ARCHIVOS en scripts/check-blob-coverage.ts si no guardan archivos.",
    "",
    "Mientras tanto, esos archivos se borrarían aunque estén en uso.",
  ].join("\n");
}

// Solo al invocarlo directamente: blob-cleanup.ts importa las funciones.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const sinCubrir = columnasSinCubrir();
  if (sinCubrir.length > 0) {
    console.error(explicarSinCubrir(sinCubrir));
    process.exit(1);
  }
  console.log("Cobertura OK: todas las columnas de URL están en la detección.");
}
