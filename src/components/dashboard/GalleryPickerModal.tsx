"use client";

import { useEffect, useState } from "react";
import { getGalleryPhotos } from "@/lib/dashboard/gallery-actions";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { GalleryPhoto } from "@/types/dashboard";

interface GalleryPickerModalProps {
  /** Si la zona acepta varios archivos, el selector deja marcar varios. */
  multiple: boolean;
  onClose: () => void;
  onPick: (photos: GalleryPhoto[]) => void;
}

/** Elegir fotos ya subidas a la Galería en vez de volver a subirlas.
 *
 * Las fotos de la Galería ya viven en Blob, así que elegirlas no sube nada:
 * se reusa la misma URL. Por eso el flujo no pasa por el verificador de
 * progreso de ArtUploadZone — no hay nada que verificar, el archivo ya
 * estaba publicado.
 *
 * Solo se ofrece en zonas de imagen: la Galería guarda fotos, y para el
 * recuadro de video no habría nada que elegir. */
export default function GalleryPickerModal({ multiple, onClose, onPick }: GalleryPickerModalProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getGalleryPhotos()
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setPhotos([]);
          setError(e instanceof Error ? e.message : "No se pudo cargar la galería.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // En una zona de un solo archivo, elegir otra reemplaza la anterior en
      // vez de acumular una selección que después habría que recortar.
      return multiple ? [...prev, id] : [id];
    });
  }

  function handleConfirm() {
    if (!photos || selectedIds.length === 0) return;
    // Se respeta el orden en que se fueron marcando, no el de la galería.
    const chosen = selectedIds
      .map((id) => photos.find((p) => p.id === id))
      .filter((p): p is GalleryPhoto => Boolean(p));
    onPick(chosen);
    onClose();
  }

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="modal-card-in flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line-2 bg-panel-2 font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Elegir de la galería</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`text-lg leading-none text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {photos === null ? (
            <p className="text-sm text-tx-3">Cargando…</p>
          ) : error ? (
            <p className="text-sm text-brand-red">{error}</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-tx-3">
              La galería está vacía — subí fotos desde la pestaña Galería y después aparecen acá.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 desktop:grid-cols-5">
              {photos.map((photo) => {
                const marcada = selectedIds.includes(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => toggle(photo.id)}
                    aria-pressed={marcada}
                    className={`relative aspect-square overflow-hidden rounded border transition-[border-color] duration-[250ms] ${PRESS_SCALE_CLASS} ${
                      marcada ? "border-brand-blue" : "border-line-2 hover:border-brand-blue/50"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de contenido cargado por el usuario */}
                    <img
                      src={photo.url}
                      alt={photo.filename ?? "Foto de la galería"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {marcada && (
                      <span className="absolute inset-0 flex items-center justify-center bg-brand-blue/25">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue text-[var(--bg)]">
                          <CheckIcon />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span className="text-xs text-tx-3">
            {selectedIds.length === 0
              ? multiple
                ? "Tocá las fotos que quieras usar."
                : "Tocá una foto para usarla."
              : `${selectedIds.length} ${selectedIds.length === 1 ? "elegida" : "elegidas"}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-[var(--bg)] px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
              className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
            >
              Usar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
