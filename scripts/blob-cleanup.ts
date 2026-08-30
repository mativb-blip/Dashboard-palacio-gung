/**
 * Borra de Vercel Blob los archivos que ninguna fila referencia.
 *
 * Comparte la detección con scripts/audit-blob-orphans.ts en vez de
 * reimplementarla: si las dos listas de columnas se separan, la de la
 * auditoría solo reporta de más, pero la de acá BORRA archivos en uso. Una
 * sola función, importada, es lo que hace que eso no pueda pasar.
 *
 * Por defecto SIMULA. Para borrar de verdad hay que pasar --borrar.
 *
 *   npx tsx --env-file=.env.produccion scripts/blob-cleanup.ts
 *   npx tsx --env-file=.env.produccion scripts/blob-cleanup.ts --borrar
 *
 * El archivo .env.produccion se arma A MANO con DATABASE_URL y
 * PUBLIC_BLOB_READ_WRITE_TOKEN copiadas del panel de Vercel: `vercel env
 * pull` NO devuelve los valores de producción, escribe "[SENSITIVE]".
 *
 * Opciones:
 *   --borrar        borra de verdad (sin esto solo muestra qué haría)
 *   --dias=N        no toca archivos subidos hace menos de N días (default 7)
 *   --forzar        saltea la barrera de proporción; ver abajo por qué existe
 */

import { del } from "@vercel/blob";
import {
  collectReferencedPathnames,
  DATABASE_URL,
  dbHost,
  listAllBlobs,
  mb,
  TOKEN,
} from "./audit-blob-orphans";

const args = process.argv.slice(2);
const BORRAR = args.includes("--borrar");
const FORZAR = args.includes("--forzar");
const DIAS = Number(args.find((a) => a.startsWith("--dias="))?.split("=")[1] ?? 7);

/** Si MÁS de esto parece huérfano, algo está mal y se aborta.
 *
 * El escenario que esto ataja es el que borra todo: correr con la DATABASE_URL
 * equivocada (la de desarrollo, una base recién migrada, una vacía). Ahí no
 * hay ninguna referencia, así que el store entero califica como huérfano y se
 * borra completo. Un número alto es señal de "estoy mirando la base que no
 * es", no de "había mucha basura". */
const PROPORCION_MAXIMA = 0.9;

/** Cuántos borra por llamada. `del()` acepta varias URLs de una. */
const LOTE = 100;

export interface Archivo {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: Date | string;
}

export interface Decision {
  abortar: boolean;
  motivo?: string;
  borrables: Archivo[];
  recientes: Archivo[];
  huerfanos: Archivo[];
}

/**
 * Decide qué se borra y si hay que abortar. Es una función PURA y exportada a
 * propósito: son las barreras que impiden vaciar el store por error, y
 * enterradas dentro de main() no habría forma de probarlas sin borrar algo de
 * verdad.
 */
export function decidirBorrado(
  blobs: Archivo[],
  referenced: Set<string>,
  dias: number,
  forzar: boolean,
  ahora: number,
): Decision {
  const huerfanos = blobs.filter((b) => !referenced.has(b.pathname));
  const corte = ahora - dias * 24 * 60 * 60 * 1000;
  const recientes = huerfanos.filter((b) => new Date(b.uploadedAt).getTime() >= corte);
  const borrables = huerfanos.filter((b) => new Date(b.uploadedAt).getTime() < corte);
  const vacio = { borrables: [], recientes, huerfanos };

  // Barrera 1: una base sin ninguna URL guardada no es "todo basura", es la
  // base equivocada o una todavía sin datos. En los dos casos, borrar sería
  // vaciar el store. No la saltea ni --forzar.
  if (referenced.size === 0) {
    return {
      abortar: true,
      motivo:
        "la base no tiene ni una URL guardada. Eso casi siempre significa DATABASE_URL apuntando a la base equivocada.",
      ...vacio,
    };
  }

  // Barrera 2: la proporción. Ver PROPORCION_MAXIMA.
  const proporcion = blobs.length > 0 ? huerfanos.length / blobs.length : 0;
  if (proporcion > PROPORCION_MAXIMA && !forzar) {
    return {
      abortar: true,
      motivo: `el ${(proporcion * 100).toFixed(0)}% del store figura como huérfano, y eso es sospechoso. Revisá que DATABASE_URL sea la de PRODUCCIÓN. Si de verdad querés borrar igual: --forzar.`,
      ...vacio,
    };
  }

  return { abortar: false, borrables, recientes, huerfanos };
}

async function main() {
  if (!TOKEN || !DATABASE_URL) {
    console.error("Faltan credenciales de producción.");
    console.error("Copialas del panel de Vercel a un .env.produccion — `vercel env pull` no las devuelve.");
    process.exit(1);
  }

  console.log(BORRAR ? "MODO: BORRAR DE VERDAD" : "MODO: simulación (nada se borra)");
  console.log(`Base consultada: ${dbHost(DATABASE_URL)}`);
  console.log(`Se conservan los archivos de los últimos ${DIAS} días.\n`);

  const [blobs, referenced] = await Promise.all([listAllBlobs(), collectReferencedPathnames()]);

  // Los recién subidos se dejan en paz: hay flujos que suben el archivo a
  // Blob ANTES de crear la fila (el audio de una canción se sube al armar el
  // formulario, y la fila recién existe al confirmar). Un archivo de hace dos
  // minutos puede ser alguien a mitad de una carga, no basura.
  const decision = decidirBorrado(blobs, referenced, DIAS, FORZAR, Date.now());
  const { huerfanos, recientes } = decision;

  const total = blobs.reduce((n, b) => n + b.size, 0);
  const pesoBorrable = decision.borrables.reduce((n, b) => n + b.size, 0);

  console.log(`Archivos en Blob:        ${blobs.length}  (${mb(total)})`);
  console.log(`URLs guardadas en la BD: ${referenced.size}`);
  console.log(`Sin referenciar:         ${huerfanos.length}`);
  console.log(`  · muy recientes:       ${recientes.length}  (se conservan)`);
  console.log(`  · a borrar:            ${decision.borrables.length}  (${mb(pesoBorrable)})\n`);

  if (decision.abortar) {
    console.error(`ABORTA: ${decision.motivo}`);
    process.exit(1);
  }

  const borrables = decision.borrables;
  if (borrables.length === 0) {
    console.log("No hay nada que borrar.");
    return;
  }

  console.log("Los 15 más pesados de los que se borrarían:");
  for (const b of [...borrables].sort((a, b) => b.size - a.size).slice(0, 15)) {
    console.log(`  ${mb(b.size).padStart(9)}  ${b.pathname}`);
  }
  console.log("");

  if (!BORRAR) {
    console.log(`Simulación: se borrarían ${borrables.length} archivos y se liberarían ${mb(pesoBorrable)}.`);
    console.log("Volvé a correrlo con --borrar para hacerlo de verdad.");
    return;
  }

  let hechos = 0;
  for (let i = 0; i < borrables.length; i += LOTE) {
    const lote = borrables.slice(i, i + LOTE);
    await del(
      lote.map((b) => b.url),
      { token: TOKEN },
    );
    hechos += lote.length;
    console.log(`  borrados ${hechos}/${borrables.length}`);
  }

  console.log(`\nListo: ${hechos} archivos borrados, ${mb(pesoBorrable)} liberados.`);
}

// Solo corre al invocar el archivo directamente, para poder importar
// decidirBorrado() desde una prueba sin disparar (ni abortar) la limpieza.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  void main();
}
