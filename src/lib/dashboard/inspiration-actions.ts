"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { instagramEmbedSrc, normalizeInstagramMusicUrl } from "@/lib/dashboard/instagram-music";
import type { InspirationItem, InspirationKind } from "@/types/dashboard";

/** Las dos secciones de /inspiracion. Validado en el server contra esta
 * lista, no confiando en lo que mande el cliente — mismo criterio que
 * FORMATS/STATUSES en proposals-actions.ts. */
const KINDS: InspirationKind[] = ["reel", "photo"];

// Cualquier usuario con sesión puede ver el repositorio — mismo criterio que
// getGalleryPhotos(); el gate real de ruta vive en src/proxy.ts.
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

// Agregar/borrar queda para Admin y Editor, igual que el resto del contenido
// curado (Galería, Moodboard) — ver requireEditor() en proposals-actions.ts.
async function requireEditor() {
  const session = await auth();
  if (session?.user.role !== "ADMIN" && session?.user.role !== "EDITOR") {
    throw new Error("Solo un Administrador o Editor puede hacer esto.");
  }
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
