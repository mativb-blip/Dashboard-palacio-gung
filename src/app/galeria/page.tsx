"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ArtUploadZone, { type UploadedFile } from "@/components/dashboard/ArtUploadZone";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { addGalleryPhoto, deleteGalleryPhoto, getGalleryPhotos } from "@/lib/dashboard/gallery-actions";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { GalleryPhoto } from "@/types/dashboard";

/** Carpeta fija en Blob Storage — no hay un id de propuesta real acá, la
 * galería es su propio depósito de fotos (ver comentario en el schema). */
const GALLERY_FOLDER = "gallery";

export default function GaleriaPage() {
  const { brandName } = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Cola transitoria del selector de subida (ArtUploadZone): se vacía apenas
  // cada archivo se persiste como GalleryPhoto — la grilla de abajo es la
  // única fuente de verdad, esto es solo la tira de miniaturas mientras sube.
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    getGalleryPhotos().then((data) => {
      if (cancelled) return;
      setPhotos(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFilesChange(next: UploadedFile[]) {
    setPendingFiles([]);
    for (const file of next) {
      try {
        const saved = await addGalleryPhoto(file.url, file.name);
        setPhotos((prev) => [saved, ...prev]);
      } catch (e) {
        alert(e instanceof Error ? e.message : "No se pudo subir la foto.");
      }
    }
  }

  async function handleDelete(photo: GalleryPhoto) {
    if (!window.confirm("¿Borrar esta foto? Esta acción no se puede deshacer.")) return;
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    try {
      await deleteGalleryPhoto(photo.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar la foto.");
      // No hace falta reponerla en su posición exacta — esto es solo el
      // camino de error, y que la foto no desaparezca es lo que importa.
      setPhotos((prev) => [photo, ...prev]);
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="galeria" planLabel={brandName} />
      <div className="flex justify-start px-4 pb-2 desktop:px-8">
        <Link
          href="/"
          className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al panel
        </Link>
      </div>
      <div className="h-px shrink-0 bg-line" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 desktop:px-8">
        <div>
          <div className="text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
          <h1 className="text-2xl font-bold">Galería de fotos</h1>
          <p className="mt-1 text-sm text-tx-2">
            Depósito de fotos suelto, sin fecha ni caption — para subir material de referencia rápido.
          </p>
        </div>

        {canEdit && (
          <ArtUploadZone
            label="Subir fotos"
            accept="image/*"
            multiple
            files={pendingFiles}
            onFilesChange={handleFilesChange}
            proposalId={GALLERY_FOLDER}
          />
        )}

        {loading ? (
          <p className="text-sm text-tx-3">Cargando…</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-tx-3">
            {canEdit ? "Todavía no se subió ninguna foto." : "Todavía no hay fotos en la galería."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 desktop:grid-cols-5">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded border border-line-2 bg-panel-2"
              >
                <button
                  type="button"
                  onClick={() => setLightboxUrl(photo.url)}
                  className={`absolute inset-0 h-full w-full transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                  aria-label={photo.filename ? `Ver ${photo.filename}` : "Ver foto"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de contenido cargado por el usuario */}
                  <img
                    src={photo.url}
                    alt={photo.filename ?? "Foto de la galería"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    aria-label="Quitar esta foto"
                    title="Quitar esta foto"
                    className={`absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-ink/70 text-[var(--bg)] opacity-0 transition-opacity duration-[250ms] group-hover:opacity-100 ${PRESS_SCALE_CLASS}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- vista ampliada, mismo asset del usuario */}
          <img
            src={lightboxUrl}
            alt="Foto de la galería en tamaño completo"
            className="max-h-full max-w-full rounded object-contain"
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Cerrar"
            className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
