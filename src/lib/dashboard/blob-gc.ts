/**
 * Borra de Vercel Blob los archivos que dejaron de estar referenciados.
 *
 * Antes, borrar una fila dejaba el archivo ocupando cuota para siempre, y eso
 * llenó el store el 2026-08-29 (958 MB de 1 GB, con 651 MB de basura). Los
 * scripts de scripts/ siguen existiendo para barrer lo que se escape; esto
 * evita que se acumule.
 *
 * REGLA DE ORO: primero se borra la FILA, después se llama acá. Al revés, la
 * fila que se está borrando se contaría a sí misma como referencia y no se
 * borraría nunca nada.
 *
 * POR QUÉ NO ALCANZA CON "borrá el archivo de la fila que borrás": una misma
 * URL la comparten varias filas, por cuatro caminos distintos —"Usar como
 * post" desde la Galería, el selector "Elegir de la galería", el puente del
 * Moodboard, y los snapshots de ProposalVersion—. Borrar de una rompería
 * artes que seguían en uso. Por eso acá se PREGUNTA primero, con una consulta
 * por tabla (no un escaneo): son ~11 consultas, sin importar cuántos archivos.
 */

import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";

// Mismo store que usa la subida (ver src/app/api/blob/upload/route.ts): el
// BLOB_READ_WRITE_TOKEN viejo apunta a otro store y no serviría.
const TOKEN = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

/** Solo se borra lo que vive en NUESTRO storage. Un enlace de Instagram o de
 * Spotify guardado en las mismas columnas no es un archivo nuestro y no hay
 * nada que borrar. */
function esArchivoNuestro(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * De las URLs dadas, cuáles siguen referenciadas por alguna fila.
 *
 * La lista de columnas es la MISMA que la de collectReferencedPathnames() en
 * scripts/audit-blob-orphans.ts, y scripts/check-blob-coverage.ts verifica que
 * las dos cubran el esquema. No es celo: una columna que falte acá significa
 * borrar un archivo que alguien está usando, y eso no se deshace.
 *
 * Exportada para poder probarla: es la decisión de la que depende que no se
 * borre nada vivo, y enterrada no habría forma de verificarla sin borrar algo
 * de verdad.
 */
export async function urlsTodaviaReferenciadas(urls: string[]): Promise<Set<string>> {
  const buscadas = new Set(urls);
  const vivas = new Set<string>();
  const anotar = (valor: string | null | undefined) => {
    if (valor && buscadas.has(valor)) vivas.add(valor);
  };

  const [proposals, versions, comments, music, gallery, stories, reels, links, elements, settings, users] =
    await Promise.all([
      prisma.proposal.findMany({
        where: { OR: [{ images: { hasSome: urls } }, { video: { in: urls } }] },
        select: { images: true, video: true },
      }),
      prisma.proposalVersion.findMany({
        where: { OR: [{ images: { hasSome: urls } }, { video: { in: urls } }] },
        select: { images: true, video: true },
      }),
      prisma.proposalComment.findMany({
        where: { images: { hasSome: urls } },
        select: { images: true },
      }),
      prisma.proposalMusicOption.findMany({
        where: { OR: [{ url: { in: urls } }, { audioUrl: { in: urls } }] },
        select: { url: true, audioUrl: true },
      }),
      prisma.galleryPhoto.findMany({ where: { url: { in: urls } }, select: { url: true } }),
      prisma.inspirationPhoto.findMany({ where: { url: { in: urls } }, select: { url: true } }),
      prisma.inspirationReel.findMany({ where: { url: { in: urls } }, select: { url: true } }),
      prisma.inspirationLink.findMany({
        where: { OR: [{ url: { in: urls } }, { audioUrl: { in: urls } }] },
        select: { url: true, audioUrl: true },
      }),
      prisma.moodboardElement.findMany({
        where: { OR: [{ url: { in: urls } }, { embedUrl: { in: urls } }] },
        select: { url: true, embedUrl: true },
      }),
      prisma.siteSettings.findMany({
        where: { OR: [{ loginBackgroundUrl: { in: urls } }, { loginLogoUrl: { in: urls } }] },
        select: { loginBackgroundUrl: true, loginLogoUrl: true },
      }),
      prisma.user.findMany({ where: { image: { in: urls } }, select: { image: true } }),
    ]);

  for (const p of proposals) [...p.images, p.video].forEach(anotar);
  for (const v of versions) [...v.images, v.video].forEach(anotar);
  for (const c of comments) c.images.forEach(anotar);
  for (const m of music) [m.url, m.audioUrl].forEach(anotar);
  for (const g of gallery) anotar(g.url);
  for (const s of stories) anotar(s.url);
  for (const r of reels) anotar(r.url);
  for (const l of links) [l.url, l.audioUrl].forEach(anotar);
  for (const e of elements) [e.url, e.embedUrl].forEach(anotar);
  for (const s of settings) [s.loginBackgroundUrl, s.loginLogoUrl].forEach(anotar);
  for (const u of users) anotar(u.image);

  return vivas;
}

/**
 * Borra de Blob las URLs que ya no referencia ninguna fila.
 *
 * Llamar DESPUÉS de borrar la fila. Nunca tira: si falla, el archivo queda en
 * Blob y lo levantará la limpieza manual — exactamente el comportamiento que
 * había antes. Lo que no puede pasar es que un fallo del recolector le rompa
 * la operación a quien solo quería borrar una foto.
 */
export async function deleteUnreferencedBlobs(
  candidatas: (string | null | undefined)[],
): Promise<void> {
  const urls = [...new Set(candidatas.filter((u): u is string => Boolean(u) && esArchivoNuestro(u!)))];
  if (urls.length === 0) return;

  try {
    const vivas = await urlsTodaviaReferenciadas(urls);
    const huerfanas = urls.filter((u) => !vivas.has(u));
    if (huerfanas.length === 0) return;
    if (!TOKEN) {
      console.warn("[blob-gc] Sin PUBLIC_BLOB_READ_WRITE_TOKEN: quedan sin borrar", huerfanas.length);
      return;
    }
    await del(huerfanas, { token: TOKEN });
  } catch (error) {
    console.error("[blob-gc] No se pudo limpiar Blob:", error);
  }
}
