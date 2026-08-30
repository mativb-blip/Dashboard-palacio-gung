"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import { formatCommentWhen } from "@/lib/dashboard/format";
import type { GalleryPhoto, GalleryPhotoCommentEntry } from "@/types/dashboard";
import { deleteUnreferencedBlobs } from "@/lib/dashboard/blob-gc";

// Cualquier usuario con sesión puede ver la galería — mismo criterio que
// getProposals(); el gate real de ruta vive en src/proxy.ts.
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

// Subir/borrar fotos queda para Admin y Editor, igual que el resto del
// contenido — ver requireEditor() en proposals-actions.ts.
async function requireEditor() {
  const session = await auth();
  if (session?.user.role !== "ADMIN" && session?.user.role !== "EDITOR") {
    throw new Error("Solo un Administrador o Editor puede hacer esto.");
  }
  return session;
}

type CommentRow = {
  id: string;
  author: string;
  authorId: string | null;
  text: string;
  createdAt: Date;
};

/** Quién puede borrar un comentario: su autor, o un Editor/Admin. Se calcula
 * en el server y viaja como booleano — el cliente no tiene que replicar la
 * regla, y ocultar un botón nunca es el permiso (el borrado la vuelve a
 * chequear). */
function canDeleteComment(
  row: CommentRow,
  viewer: { id?: string; role?: string },
): boolean {
  if (viewer.role === "ADMIN" || viewer.role === "EDITOR") return true;
  return Boolean(row.authorId && viewer.id && row.authorId === viewer.id);
}

function toGalleryPhoto(
  row: {
    id: string;
    url: string;
    filename: string | null;
    uploadedBy: string | null;
    createdAt: Date;
    comments?: CommentRow[];
  },
  now: Date,
  viewer: { id?: string; role?: string },
): GalleryPhoto {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename ?? undefined,
    uploadedBy: row.uploadedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
    comments: (row.comments ?? []).map(
      (c): GalleryPhotoCommentEntry => ({
        id: c.id,
        author: c.author,
        text: c.text,
        when: formatCommentWhen(c.createdAt, now),
        canDelete: canDeleteComment(c, viewer),
      }),
    ),
  };
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  const session = await requireSession();
  const rows = await prisma.galleryPhoto.findMany({
    orderBy: { createdAt: "desc" },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  const now = new Date();
  const viewer = { id: session.user.id, role: session.user.role };
  return rows.map((row) => toGalleryPhoto(row, now, viewer));
}

export async function addGalleryPhoto(url: string, filename?: string): Promise<GalleryPhoto> {
  const session = await requireEditor();
  const row = await prisma.galleryPhoto.create({
    data: {
      url: assertBlobUrl(url, "No se pudo subir la foto."),
      filename: filename?.trim().slice(0, 200) || null,
      uploadedBy: session.user.name || session.user.email || null,
    },
    include: { comments: true },
  });
  revalidatePath("/galeria");
  return toGalleryPhoto(row, new Date(), { id: session.user.id, role: session.user.role });
}

export async function deleteGalleryPhoto(id: string): Promise<void> {
  await requireEditor();
  // La URL se lee ANTES de borrar la fila; el recolector corre DESPUÉS, para
  // que la fila que se va no se cuente a sí misma como referencia. Si esta
  // foto además se usó como arte de una propuesta, el archivo sobrevive.
  const foto = await prisma.galleryPhoto.findUnique({ where: { id }, select: { url: true } });
  await prisma.galleryPhoto.delete({ where: { id } });
  await deleteUnreferencedBlobs([foto?.url]);
  revalidatePath("/galeria");
}

/** Comentar una foto alcanza con sesión: es justamente lo que hace Jun, que
 * es Comentarista — mismo criterio que addComment() sobre una propuesta. */
export async function addGalleryPhotoComment(
  photoId: string,
  text: string,
): Promise<GalleryPhotoCommentEntry> {
  const session = await requireSession();
  const value = text.trim();
  if (!value) throw new Error("Escribí un comentario.");

  const row = await prisma.galleryPhotoComment.create({
    data: {
      photoId,
      author: session.user.name || session.user.email || "Desconocido",
      authorId: session.user.id ?? null,
      text: value.slice(0, 2000),
    },
  });

  revalidatePath("/galeria");
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    when: formatCommentWhen(row.createdAt, new Date()),
    // Quien acaba de escribirlo siempre puede borrarlo.
    canDelete: true,
  };
}

export async function deleteGalleryPhotoComment(commentId: string): Promise<void> {
  const session = await requireSession();
  const row = await prisma.galleryPhotoComment.findUnique({ where: { id: commentId } });
  if (!row) throw new Error("Ese comentario ya no existe.");

  // Se vuelve a chequear acá y no solo en la UI: esconder el botón no es un
  // permiso.
  if (!canDeleteComment(row, { id: session.user.id, role: session.user.role })) {
    throw new Error("Solo podés borrar tus propios comentarios.");
  }

  await prisma.galleryPhotoComment.delete({ where: { id: commentId } });
  revalidatePath("/galeria");
}
