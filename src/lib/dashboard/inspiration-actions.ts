"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { instagramEmbedSrc, normalizeInstagramMusicUrl } from "@/lib/dashboard/instagram-music";
import type { InspirationPhoto, InspirationReel } from "@/types/dashboard";

// Cualquier usuario con sesión puede ver el repositorio — mismo criterio que
// getGalleryPhotos(); el gate real de ruta vive en src/proxy.ts.
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

// Agregar/borrar reels queda para Admin y Editor, igual que el resto del
// contenido curado (Galería, Moodboard) — ver requireEditor() en
// proposals-actions.ts.
async function requireEditor() {
  const session = await auth();
  if (session?.user.role !== "ADMIN" && session?.user.role !== "EDITOR") {
    throw new Error("Solo un Administrador o Editor puede hacer esto.");
  }
  return session;
}

function toInspirationReel(row: { id: string; url: string; addedBy: string | null; createdAt: Date }, now: Date): InspirationReel {
  return {
    id: row.id,
    url: row.url,
    addedBy: row.addedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getInspirationReels(): Promise<InspirationReel[]> {
  await requireSession();
  const rows = await prisma.inspirationReel.findMany({ orderBy: { createdAt: "desc" } });
  const now = new Date();
  return rows.map((row) => toInspirationReel(row, now));
}

export async function addInspirationReel(url: string): Promise<InspirationReel> {
  const session = await requireEditor();
  // Misma validación que la música (ver MusicSection): normaliza y exige
  // instagram.com. Acá además hace falta que sea embebible — un reel que no
  // se puede mostrar no le sirve a este repositorio, que existe solo para
  // mirar, no para guardar enlaces sueltos.
  const normalized = normalizeInstagramMusicUrl(url);
  const embedSrc = instagramEmbedSrc(normalized);
  if (!embedSrc) {
    throw new Error("Pegá el link de un post o reel de Instagram (no una página de audio ni de perfil).");
  }

  // Compara por el embed derivado, no por el string crudo: el mismo reel
  // pegado como /p/, /reel/, /reels/ o /tv/ da cuatro URLs normalizadas
  // distintas que igual apuntan al mismo embed — comparar solo por `url`
  // dejaba pasar duplicados visualmente idénticos.
  const existing = await prisma.inspirationReel.findMany({ select: { url: true } });
  if (existing.some((r) => instagramEmbedSrc(r.url) === embedSrc)) {
    throw new Error("Ese reel ya está en el repositorio.");
  }

  const row = await prisma.inspirationReel.create({
    data: { url: normalized, addedBy: session.user.name || session.user.email || null },
  });
  revalidatePath("/inspiracion");
  return toInspirationReel(row, new Date());
}

export async function deleteInspirationReel(id: string): Promise<void> {
  await requireEditor();
  await prisma.inspirationReel.delete({ where: { id } });
  revalidatePath("/inspiracion");
}

function toInspirationPhoto(
  row: { id: string; url: string; filename: string | null; addedBy: string | null; createdAt: Date },
  now: Date,
): InspirationPhoto {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename ?? undefined,
    addedBy: row.addedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getInspirationPhotos(): Promise<InspirationPhoto[]> {
  await requireSession();
  const rows = await prisma.inspirationPhoto.findMany({ orderBy: { createdAt: "desc" } });
  const now = new Date();
  return rows.map((row) => toInspirationPhoto(row, now));
}

export async function addInspirationPhoto(url: string, filename?: string): Promise<InspirationPhoto> {
  const session = await requireEditor();
  const row = await prisma.inspirationPhoto.create({
    data: {
      url: assertBlobUrl(url, "No se pudo subir la foto."),
      filename: filename?.trim().slice(0, 200) || null,
      addedBy: session.user.name || session.user.email || null,
    },
  });
  revalidatePath("/inspiracion");
  return toInspirationPhoto(row, new Date());
}

/** Igual que la Galería: se borra la fila, no el archivo en Blob — no hay
 * forma barata de saber si algo más lo referencia. */
export async function deleteInspirationPhoto(id: string): Promise<void> {
  await requireEditor();
  await prisma.inspirationPhoto.delete({ where: { id } });
  revalidatePath("/inspiracion");
}
