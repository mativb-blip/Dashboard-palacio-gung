"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import { formatCommentWhen } from "@/lib/dashboard/format";
import type { GalleryPhoto } from "@/types/dashboard";

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

function toGalleryPhoto(
  row: { id: string; url: string; filename: string | null; uploadedBy: string | null; createdAt: Date },
  now: Date,
): GalleryPhoto {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename ?? undefined,
    uploadedBy: row.uploadedBy ?? undefined,
    when: formatCommentWhen(row.createdAt, now),
  };
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  await requireSession();
  const rows = await prisma.galleryPhoto.findMany({ orderBy: { createdAt: "desc" } });
  const now = new Date();
  return rows.map((row) => toGalleryPhoto(row, now));
}

export async function addGalleryPhoto(url: string, filename?: string): Promise<GalleryPhoto> {
  const session = await requireEditor();
  const row = await prisma.galleryPhoto.create({
    data: {
      url: assertBlobUrl(url, "No se pudo subir la foto."),
      filename: filename?.trim().slice(0, 200) || null,
      uploadedBy: session.user.name || session.user.email || null,
    },
  });
  revalidatePath("/galeria");
  return toGalleryPhoto(row, new Date());
}

export async function deleteGalleryPhoto(id: string): Promise<void> {
  await requireEditor();
  await prisma.galleryPhoto.delete({ where: { id } });
  revalidatePath("/galeria");
}
