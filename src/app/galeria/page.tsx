"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ArtUploadZone, { type UploadedFile } from "@/components/dashboard/ArtUploadZone";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";
import {
  addGalleryPhoto,
  addGalleryPhotoComment,
  deleteGalleryPhoto,
  deleteGalleryPhotoComment,
  getGalleryPhotos,
} from "@/lib/dashboard/gallery-actions";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { GalleryPhoto } from "@/types/dashboard";

/** Carpeta fija en Blob Storage — no hay un id de propuesta real acá, la
 * galería es su propio depósito de fotos (ver comentario en el schema). */
const GALLERY_FOLDER = "gallery";

/** Marcas de la hoja de contacto. Se separan en dos porque una foto puede
 * estar marcada por los dos lados a la vez, y ahí se muestran los dos
 * recuadros. */
function marcadaPorCliente(photo: GalleryPhoto): boolean {
  return photo.comments.some((c) => c.authorIsClient);
}

function marcadaPorAgencia(photo: GalleryPhoto): boolean {
  return photo.comments.some((c) => !c.authorIsClient);
}

export default function GaleriaPage() {
  const { brandName } = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  // Por id y no por URL: para pasar a la foto siguiente hace falta saber en
  // qué posición de `photos` estamos parados. Además, si la foto abierta se
  // borra, el find() de abajo deja de encontrarla y el visor se cierra solo.
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  // Cola transitoria del selector de subida (ArtUploadZone): se vacía apenas
  // cada archivo se persiste como GalleryPhoto — la grilla de abajo es la
  // única fuente de verdad, esto es solo la tira de miniaturas mientras sube.
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);

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

  const lightboxIndex = photos.findIndex((p) => p.id === lightboxId);
  const lightboxPhoto = lightboxIndex >= 0 ? photos[lightboxIndex] : null;

  /** Mueve `step` fotos desde la abierta. No da la vuelta al llegar a los
   * extremos: en un visor de fotos, volver al principio sin aviso confunde
   * más de lo que ayuda — simplemente no pasa nada. */
  function stepPhoto(step: number) {
    if (lightboxIndex < 0) return;
    const next = photos[lightboxIndex + step];
    if (next) setLightboxId(next.id);
  }

  async function handleAddComment() {
    if (!lightboxPhoto) return;
    const text = commentDraft.trim();
    if (!text) return;
    setSavingComment(true);
    try {
      const saved = await addGalleryPhotoComment(lightboxPhoto.id, text);
      setPhotos((prev) =>
        prev.map((p) => (p.id === lightboxPhoto.id ? { ...p, comments: [...p.comments, saved] } : p)),
      );
      setCommentDraft("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar el comentario.");
    } finally {
      setSavingComment(false);
    }
  }

  async function handleDeleteComment(photoId: string, commentId: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p)),
    );
    try {
      await deleteGalleryPhotoComment(commentId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar el comentario.");
      // Se recarga en vez de reponer a mano: si el borrado falló no sabemos
      // en qué quedó el server, y la lista de la base es la verdad.
      getGalleryPhotos().then(setPhotos).catch(() => {});
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
                  onClick={() => setLightboxId(photo.id)}
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

                {/* La marca de hoja de contacto, con el color de QUIEN comentó:
                    rojo el cliente (Jun), verde la agencia. Si comentaron los
                    dos se pintan los dos recuadros, uno dentro del otro — el
                    dato es "a quién le gustó", y quedarse con un solo color
                    perdería la mitad.

                    Va como CAPA APARTE encima de la foto, no como `ring` en la
                    celda: un ring es un box-shadow `inset`, y un inset se pinta
                    debajo del contenido hijo, así que la <img> (que cubre la
                    celda entera) lo tapaba por completo. El bug no se veía con
                    URLs de prueba rotas, justamente porque no había imagen que
                    lo tapara. */}
                {marcadaPorCliente(photo) && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded ring-2 ring-brand-red ring-inset"
                  />
                )}
                {marcadaPorAgencia(photo) && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute rounded ring-2 ring-emerald-500 ring-inset ${
                      marcadaPorCliente(photo) ? "inset-[3px]" : "inset-0"
                    }`}
                  />
                )}

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

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-lg"
          onClick={() => setLightboxId(null)}
        >
          {/* La foto ocupa lo que sobra y el panel de comentarios se queda
              con su franja abajo — en columna y no con el panel flotando
              encima, para que en el teléfono nunca le tape la imagen. */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista ampliada, mismo asset del usuario */}
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.filename ?? "Foto de la galería en tamaño completo"}
              className="max-h-full max-w-full rounded object-contain select-none"
              // Arrastrar la foto en desktop iniciaría el drag&drop nativo del
              // navegador, que acá no lleva a nada.
              draggable={false}
            />
          </div>

          <button
            type="button"
            onClick={() => setLightboxId(null)}
            aria-label="Cerrar"
            className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            <CloseIcon />
          </button>

          {/* La foto ya vive en Blob, así que no hace falta volver a subirla:
              se pasa por query param y el formulario la toma como arte ya
              cargado (ver ?photo= en /nueva-propuesta). Se usa el formulario
              completo en vez de crear la propuesta acá para no tener un
              tercer camino que arme Proposals por su cuenta. */}
          {canEdit && (
            <Link
              href={`/nueva-propuesta?photo=${encodeURIComponent(lightboxPhoto.url)}`}
              onClick={(e) => e.stopPropagation()}
              className={`absolute top-4 left-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs leading-none font-bold tracking-[0.04em] text-black transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              <PostIcon />
              Usar como post
            </Link>
          )}

          {/* Flechas en vez de swipe: el gesto resultaba poco fiable en el
              teléfono (cambiaba de foto o cerraba el visor cuando no se
              quería), y un control que se ve y se toca no tiene ese problema.
              stopPropagation porque el overlay cierra al hacer click. */}
          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepPhoto(-1);
              }}
              aria-label="Foto anterior"
              title="Foto anterior"
              className={`absolute top-1/2 left-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-white/70 transition-colors duration-[250ms] hover:text-white ${PRESS_SCALE_CLASS}`}
            >
              <ChevronLeftIcon />
            </button>
          )}
          {lightboxIndex < photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepPhoto(1);
              }}
              aria-label="Foto siguiente"
              title="Foto siguiente"
              className={`absolute top-1/2 right-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-white/70 transition-colors duration-[250ms] hover:text-white ${PRESS_SCALE_CLASS}`}
            >
              <ChevronRightIcon />
            </button>
          )}

          {/* Notas sobre la foto. Comentar alcanza con sesión — es lo que
              hace Jun para marcar las que le gustan, y una foto con al menos
              una nota queda con recuadro rojo en la grilla. */}
          <div
            className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-white/15 bg-black/60 px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] tracking-label text-white/50 uppercase">
                  {lightboxPhoto.comments.length === 0
                    ? "Sin comentarios"
                    : `${lightboxPhoto.comments.length} ${lightboxPhoto.comments.length === 1 ? "comentario" : "comentarios"}`}
                </span>
                {photos.length > 1 && (
                  <span className="text-xs text-white/50 tabular-nums">
                    {lightboxIndex + 1} / {photos.length}
                  </span>
                )}
              </div>

              {lightboxPhoto.comments.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {lightboxPhoto.comments.map((comment) => (
                    <li key={comment.id} className="flex items-start gap-2 rounded bg-white/[0.06] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-xs font-bold text-white">{comment.author}</span>
                          <span className="text-[11px] text-white/40">{comment.when}</span>
                        </div>
                        <p className="mt-0.5 text-[13px] leading-[1.5] whitespace-pre-line text-white/85">
                          {comment.text}
                        </p>
                      </div>
                      {comment.canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(lightboxPhoto.id, comment.id)}
                          aria-label="Borrar comentario"
                          title="Borrar comentario"
                          className={`shrink-0 text-white/40 transition-colors duration-[250ms] hover:text-white ${PRESS_SCALE_CLASS}`}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Escribí un comentario sobre esta foto…"
                  rows={2}
                  className="min-h-10 w-full flex-1 resize-y rounded border border-white/20 bg-white/[0.06] px-3 py-2 text-[13px] text-white placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={savingComment || !commentDraft.trim()}
                  className={`inline-flex min-h-10 shrink-0 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
                >
                  {savingComment ? "Guardando…" : "Comentar"}
                </button>
              </div>
            </div>
          </div>
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

/** Mismo glifo de "imagen dentro de un marco" que usa el Topbar para la
 * vista Post — es a donde lleva el botón. */
function PostIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** Flechas de navegación del visor: trazo fino, sin círculo de fondo — la
 * foto es lo que importa, el control tiene que estar y no pesar. El área
 * táctil (48px) es más grande que el glifo. */
function ChevronLeftIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
