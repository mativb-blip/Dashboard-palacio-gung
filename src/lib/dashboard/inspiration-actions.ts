"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { instagramEmbedSrc, normalizeInstagramMusicUrl } from "@/lib/dashboard/instagram-music";
import { normalizeExternalUrl, normalizeSongUrl } from "@/lib/dashboard/link-url";
import type {
  InspirationItem,
  InspirationKind,
  InspirationLinkItem,
  InspirationLinkKind,
  InspirationStory,
} from "@/types/dashboard";

/** Las dos secciones de /inspiracion que van por ENLACE de Instagram
 * (Historias es aparte: son archivos subidos, ver más abajo). Validado en el
 * server contra esta lista, no confiando en lo que mande el cliente — mismo
 * criterio que FORMATS/STATUSES en proposals-actions.ts. */
const KINDS: InspirationKind[] = ["reel", "photo"];

// Cualquier usuario con sesión puede ver el repositorio — mismo criterio que
// getGalleryPhotos(); el gate real de ruta vive en src/proxy.ts.
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

// Inspiración es la excepción a requireEditor(): acá agregar y borrar queda
// abierto a CUALQUIERA con sesión, Comentarista incluido. Es a pedido y tiene
// sentido — es un repositorio de referencias para mirar antes de producir, y
// el cliente es quien mejor sabe qué le gusta. No es contenido que se publique
// ni que se apruebe, así que abrirlo no pone nada en riesgo.
//
// Ojo con el nombre: se mantiene `requireEditor` porque es el que ya usan las
// ocho funciones de abajo, pero lo que exige ahora es sesión. Ver el resto del
// dashboard (proposals-actions.ts) donde requireEditor() sí es Admin/Editor.
async function requireEditor() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

function toInspirationItem(
  row: { id: string; url: string; kind: string; addedBy: string | null; createdAt: Date },
  now: Date,
): InspirationItem {
  return {
    id: row.id,
    url: row.url,
    kind: KINDS.includes(row.kind as InspirationKind) ? (row.kind as InspirationKind) : "reel",
    addedBy: row.addedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getInspirationItems(kind: InspirationKind): Promise<InspirationItem[]> {
  await requireSession();
  const rows = await prisma.inspirationReel.findMany({
    where: { kind },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return rows.map((row) => toInspirationItem(row, now));
}

export async function addInspirationItem(url: string, kind: InspirationKind): Promise<InspirationItem> {
  const session = await requireEditor();
  const safeKind: InspirationKind = KINDS.includes(kind) ? kind : "reel";

  // Misma validación que la música (ver MusicSection): normaliza y exige
  // instagram.com. Acá además tiene que poder embeberse — un link que no se
  // puede mostrar no le sirve a un repositorio que existe solo para mirar.
  const normalized = normalizeInstagramMusicUrl(url);
  const embedSrc = instagramEmbedSrc(normalized);
  if (!embedSrc) {
    throw new Error("Pegá el link de un post o reel de Instagram (no una página de audio ni de perfil).");
  }

  // Compara por el embed derivado, no por el string crudo: el mismo post
  // pegado como /p/, /reel/, /reels/ o /tv/ da URLs normalizadas distintas
  // que igual apuntan al mismo embed. Se compara dentro de la misma sección:
  // que un post esté en Reels no impide guardarlo en Fotos.
  const existing = await prisma.inspirationReel.findMany({
    where: { kind: safeKind },
    select: { url: true },
  });
  if (existing.some((r) => instagramEmbedSrc(r.url) === embedSrc)) {
    throw new Error("Ese post ya está en esta sección.");
  }

  const row = await prisma.inspirationReel.create({
    data: { url: normalized, kind: safeKind, addedBy: session.user.name || session.user.email || null },
  });
  revalidatePath("/inspiracion");
  return toInspirationItem(row, new Date());
}

export async function deleteInspirationItem(id: string): Promise<void> {
  await requireEditor();
  await prisma.inspirationReel.delete({ where: { id } });
  revalidatePath("/inspiracion");
}

// --- Historias (tercera sección) ---------------------------------------
// Capturas de pantalla y videos subidos, no enlaces: una historia expira y
// no tiene permalink embebible, así que el archivo es la única forma de
// guardarla. Respaldado por InspirationPhoto (nombre histórico, ver schema).

function toInspirationStory(
  row: { id: string; url: string; filename: string | null; addedBy: string | null; createdAt: Date },
  now: Date,
): InspirationStory {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename ?? undefined,
    addedBy: row.addedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getInspirationStories(): Promise<InspirationStory[]> {
  await requireSession();
  const rows = await prisma.inspirationPhoto.findMany({ orderBy: { createdAt: "desc" } });
  const now = new Date();
  return rows.map((row) => toInspirationStory(row, now));
}

export async function addInspirationStory(url: string, filename?: string): Promise<InspirationStory> {
  const session = await requireEditor();
  const row = await prisma.inspirationPhoto.create({
    data: {
      url: assertBlobUrl(url, "No se pudo subir el archivo."),
      filename: filename?.trim().slice(0, 200) || null,
      addedBy: session.user.name || session.user.email || null,
    },
  });
  revalidatePath("/inspiracion");
  return toInspirationStory(row, new Date());
}

/** Igual que la Galería: se borra la fila, no el archivo en Blob. */
export async function deleteInspirationStory(id: string): Promise<void> {
  await requireEditor();
  await prisma.inspirationPhoto.delete({ where: { id } });
  revalidatePath("/inspiracion");
}

// --- Canciones y Enlaces (cuarta y quinta sección) ----------------------
// Un solo modelo con discriminador, igual que Reels/Fotos — ver
// InspirationLink en el schema. Lo que cambia entre las dos es qué se acepta
// como URL, y eso se decide acá, en el server.

const LINK_KINDS: InspirationLinkKind[] = ["song", "link"];

function toInspirationLinkItem(
  row: {
    id: string;
    kind: string;
    url: string | null;
    title: string | null;
    audioUrl: string | null;
    audioName: string | null;
    addedBy: string | null;
    createdAt: Date;
  },
  now: Date,
): InspirationLinkItem {
  return {
    id: row.id,
    kind: LINK_KINDS.includes(row.kind as InspirationLinkKind) ? (row.kind as InspirationLinkKind) : "link",
    url: row.url ?? undefined,
    title: row.title ?? undefined,
    audioUrl: row.audioUrl ?? undefined,
    audioName: row.audioName ?? undefined,
    addedBy: row.addedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getInspirationLinks(kind: InspirationLinkKind): Promise<InspirationLinkItem[]> {
  await requireSession();
  const rows = await prisma.inspirationLink.findMany({
    where: { kind },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return rows.map((row) => toInspirationLinkItem(row, now));
}

export interface AddInspirationLinkInput {
  url?: string;
  title?: string;
  /** Solo se guarda en las canciones — un enlace no lleva audio. */
  audioUrl?: string;
  audioName?: string;
}

export async function addInspirationLink(
  kind: InspirationLinkKind,
  input: AddInspirationLinkInput,
): Promise<InspirationLinkItem> {
  const session = await requireEditor();
  const safeKind: InspirationLinkKind = LINK_KINDS.includes(kind) ? kind : "link";
  const rawUrl = input.url?.trim();

  // El audio es exclusivo de las canciones. No se rechaza el pedido si viene
  // en un enlace, se ignora: lo que importa es que no quede guardado donde no
  // corresponde, y la UI de Enlaces ni siquiera ofrece subirlo.
  const audioUrl =
    safeKind === "song" && input.audioUrl
      ? assertBlobUrl(input.audioUrl, "No se pudo subir el audio.")
      : null;

  // Una canción vale con el enlace, con el archivo, o con los dos — pero no
  // vacía. Un enlace, en cambio, es nada más que la URL: sin ella no hay nada
  // que guardar.
  let url: string | null = null;
  if (rawUrl) {
    url = safeKind === "song" ? normalizeSongUrl(rawUrl) : normalizeExternalUrl(rawUrl);
  } else if (safeKind === "song" && !audioUrl) {
    throw new Error("Pegá un enlace o subí un archivo de audio.");
  } else if (safeKind === "link") {
    throw new Error("Pegá un enlace.");
  }

  // Se compara contra la URL ya normalizada, que es lo que hace que dos
  // formas de pegar el mismo link cuenten como repetidas. Las canciones sin
  // enlace (solo audio) no se comparan: dos archivos distintos de la misma
  // canción son dos entradas legítimas.
  if (url) {
    const duplicate = await prisma.inspirationLink.findFirst({
      where: { kind: safeKind, url },
      select: { id: true },
    });
    if (duplicate) throw new Error("Ese enlace ya está en esta sección.");
  }

  const row = await prisma.inspirationLink.create({
    data: {
      kind: safeKind,
      url,
      title: input.title?.trim().slice(0, 200) || null,
      audioUrl,
      audioName: audioUrl ? input.audioName?.trim().slice(0, 200) || null : null,
      addedBy: session.user.name || session.user.email || null,
    },
  });
  revalidatePath("/inspiracion");
  return toInspirationLinkItem(row, new Date());
}

/** Igual que el resto: se borra la fila, no el archivo en Blob. */
export async function deleteInspirationLink(id: string): Promise<void> {
  await requireEditor();
  await prisma.inspirationLink.delete({ where: { id } });
  revalidatePath("/inspiracion");
}
