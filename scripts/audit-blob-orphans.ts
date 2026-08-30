/**
 * Auditoría de archivos huérfanos en Vercel Blob — SOLO LECTURA.
 *
 * Este script NO borra nada. Lista lo que hay en el store, junta todas las
 * URLs que la base tiene guardadas, y reporta qué archivos no aparecen
 * referenciados en ninguna fila.
 *
 * Por qué existe: cuando se borra una foto de la Galería, se quita el audio
 * de una música o se elimina un elemento del Moodboard, se borra la FILA
 * pero el archivo queda en Blob (decisión deliberada: no hay forma barata de
 * saber si algo más lo referencia). Con el tiempo eso acumula peso contra la
 * cuota.
 *
 * CRITERIO: contar referencias de MÁS es seguro; contar de MENOS marcaría
 * como huérfano un archivo en uso. Por eso se incluyen todas las columnas de
 * URL del esquema, incluidas las que guardan enlaces de Instagram y no
 * archivos propios — nunca van a coincidir con un blob, y de paso el día que
 * alguna cambie de contenido el script no se queda corto.
 *
 * Uso (necesita credenciales de PRODUCCIÓN):
 *   npx vercel env pull .env.production.local --environment=production
 *   npx tsx --env-file=.env.production.local scripts/audit-blob-orphans.ts
 *
 * El --environment=production no es opcional: sin eso baja las variables de
 * desarrollo, la auditoría corre contra la base local y reporta como
 * huérfano casi todo. La primera línea de salida imprime el host consultado
 * justamente para poder verificarlo.
 */

import { list, type ListBlobResultBlob } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export const TOKEN = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
export const DATABASE_URL = process.env.DATABASE_URL;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

/** El host de la base, sin credenciales — para confirmar de un vistazo que
 * esto corrió contra producción y no contra la base local. Apuntar a la base
 * equivocada haría que casi todo se reporte como huérfano. */
export function dbHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(no se pudo leer)";
  }
}

export function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compara por pathname y no por URL completa: el pathname es lo que
 * identifica al archivo en el store, y así una diferencia de dominio o de
 * query string no hace pasar por huérfano a algo que sí está en uso. */
function pathnameOf(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

/** Todas las URLs guardadas en la base, de cualquier columna que pueda
 * contener una. Ver el criterio de arriba sobre incluir de más. */
export async function collectReferencedPathnames(): Promise<Set<string>> {
  const urls: (string | null)[] = [];

  const [proposals, versions, comments, music, gallery, stories, reels, elements, settings] =
    await Promise.all([
      prisma.proposal.findMany({ select: { images: true, video: true } }),
      prisma.proposalVersion.findMany({ select: { images: true, video: true } }),
      prisma.proposalComment.findMany({ select: { images: true } }),
      prisma.proposalMusicOption.findMany({ select: { url: true, audioUrl: true } }),
      prisma.galleryPhoto.findMany({ select: { url: true } }),
      prisma.inspirationPhoto.findMany({ select: { url: true } }),
      prisma.inspirationReel.findMany({ select: { url: true } }),
      prisma.moodboardElement.findMany({ select: { url: true, embedUrl: true } }),
      prisma.siteSettings.findMany({ select: { loginBackgroundUrl: true, loginLogoUrl: true } }),
    ]);

  for (const p of proposals) urls.push(...p.images, p.video);
  for (const v of versions) urls.push(...v.images, v.video);
  for (const c of comments) urls.push(...c.images);
  for (const m of music) urls.push(m.url, m.audioUrl);
  for (const g of gallery) urls.push(g.url);
  for (const s of stories) urls.push(s.url);
  for (const r of reels) urls.push(r.url);
  for (const e of elements) urls.push(e.url, e.embedUrl);
  for (const s of settings) urls.push(s.loginBackgroundUrl, s.loginLogoUrl);

  const paths = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    const p = pathnameOf(u);
    if (p) paths.add(p);
  }
  return paths;
}

export async function listAllBlobs(): Promise<ListBlobResultBlob[]> {
  const all: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token: TOKEN, cursor, limit: 1000 });
    all.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all;
}

async function main() {
  if (!TOKEN || !DATABASE_URL) {
    console.error(
      `Faltan credenciales: ${!TOKEN ? "PUBLIC_BLOB_READ_WRITE_TOKEN " : ""}${!DATABASE_URL ? "DATABASE_URL" : ""}`.trim(),
    );
    console.error("Traelas con: npx vercel env pull .env.production.local --environment=production");
    process.exit(1);
  }

  console.log(`Base consultada: ${dbHost(DATABASE_URL)}`);

  const [blobs, referenced] = await Promise.all([listAllBlobs(), collectReferencedPathnames()]);

  const orphans = blobs.filter((b) => !referenced.has(b.pathname));
  const totalSize = blobs.reduce((n, b) => n + b.size, 0);
  const orphanSize = orphans.reduce((n, b) => n + b.size, 0);

  console.log("");
  console.log(`Archivos en Blob:        ${blobs.length}  (${mb(totalSize)})`);
  console.log(`URLs guardadas en la BD: ${referenced.size}`);
  console.log(`Sin referenciar:         ${orphans.length}  (${mb(orphanSize)})`);
  if (totalSize > 0) {
    console.log(`Recuperable:             ${((orphanSize / totalSize) * 100).toFixed(0)}% del espacio usado`);
  }

  // Agrupado por carpeta, que es lo que dice de dónde vino cada archivo.
  const porCarpeta = new Map<string, { n: number; size: number }>();
  for (const b of orphans) {
    const carpeta = b.pathname.split("/")[0] || "(raíz)";
    const acc = porCarpeta.get(carpeta) ?? { n: 0, size: 0 };
    acc.n += 1;
    acc.size += b.size;
    porCarpeta.set(carpeta, acc);
  }
  if (porCarpeta.size) {
    console.log("\nHuérfanos por carpeta:");
    for (const [carpeta, { n, size }] of [...porCarpeta].sort((a, b) => b[1].size - a[1].size)) {
      console.log(`  ${carpeta.padEnd(24)} ${String(n).padStart(4)} archivos   ${mb(size)}`);
    }
  }

  console.log("\nLos 15 huérfanos más pesados:");
  for (const b of [...orphans].sort((a, b) => b.size - a.size).slice(0, 15)) {
    console.log(`  ${mb(b.size).padStart(9)}  ${b.pathname}`);
  }

  console.log("\nEste script no borró nada.");
  await prisma.$disconnect();
}

// Solo corre cuando se invoca el archivo directamente, para poder importar
// collectReferencedPathnames() desde una prueba sin disparar la auditoría.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  void main();
}
