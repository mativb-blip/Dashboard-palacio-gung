"use client";

import { useSession } from "next-auth/react";
import { useRef, useState, type ClipboardEvent } from "react";
import { makeFileId, uploadFileToBlob } from "./ArtUploadZone";
import PhotoLightbox from "./PhotoLightbox";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { initials } from "@/lib/dashboard/format";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";

/** Lo que hace falta para crear un comentario — `id`/`when`/`resolved` los
 * pone el server (fila real en la base), no el cliente. */
export interface AddCommentInput {
  author: string;
  text: string;
  avatarBg: string;
  scope?: string;
  images?: string[];
}

interface DraftImage {
  id: string;
  url: string;
}

interface CommentsPanelProps {
  proposal: Proposal;
  onAddComment: (input: AddCommentInput) => void | Promise<void>;
  onToggleCommentResolved: (commentId: string) => void;
}

export default function CommentsPanel({
  proposal,
  onAddComment,
  onToggleCommentResolved,
}: CommentsPanelProps) {
  const { data: session } = useSession();
  const { commentNotifyTo, commentNotifyCc } = useBrand();
  const authorName = session?.user?.name || session?.user?.email || "Tú";
  const [draft, setDraft] = useState("");
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addImageFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setUploadError("");
    setUploadingImages(true);
    try {
      const added = await Promise.all(
        images.map(async (f) => ({ id: makeFileId(), url: await uploadFileToBlob(proposal.id, f) })),
      );
      setDraftImages((prev) => [...prev, ...added]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "No se pudo subir la captura.");
    } finally {
      setUploadingImages(false);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const found: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) found.push(file);
      }
    }
    if (found.length) void addImageFiles(found);
  }

  function removeDraftImage(id: string) {
    setDraftImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function handleSubmit() {
    const text = draft.trim();
    if (!text) return;
    await onAddComment({
      author: authorName,
      text,
      avatarBg: "#5C5C63",
      images: draftImages.map((img) => img.url),
    });
    setDraft("");
    setDraftImages([]);
  }

  return (
    <div className="border-l-[3px] border-brand-blue bg-panel-2 p-[18px]">
      <div className="mb-3 text-[13px] font-bold tracking-label uppercase">Comentarios</div>

      <div className="mb-3.5 flex flex-col gap-3">
        {proposal.comments.length > 0 ? (
          proposal.comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: comment.avatarBg }}
              >
                {initials(comment.author)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-tx-3">
                    <strong className="text-brand-ink">{comment.author}</strong> · {comment.when}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCommentResolved(comment.id)}
                    className={`shrink-0 rounded-sm border px-2 py-0.5 text-[10px] leading-none font-bold tracking-label uppercase transition-[background-color,border-color,color,transform] duration-[400ms] ${PRESS_SCALE_CLASS} ${
                      comment.resolved
                        ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
                        : "border-brand-red bg-transparent text-[var(--color-brand-red-text)]"
                    }`}
                  >
                    {comment.resolved ? "Resuelto" : "Pendiente"}
                  </button>
                </div>
                <div className="text-sm leading-[1.5]">{comment.text}</div>
                {comment.images && comment.images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {comment.images.map((src, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightboxSrc(src)}
                        aria-label="Ver captura en grande"
                        className={`h-14 w-14 cursor-zoom-in overflow-hidden rounded border border-line-2 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- captura adjunta por el usuario en el comentario */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-[13px] text-tx-3 italic">Sin comentarios todavía.</div>
        )}
      </div>

      <div className="mb-2 text-xs text-tx-3">
        Comentando como <strong className="text-brand-ink">{authorName}</strong>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={handlePaste}
        placeholder="Escribe un comentario… (pegá una captura con ⌘V)"
        aria-label="Comentario"
        className="min-h-16 w-full resize-y rounded border border-line-2 bg-panel-2 px-3 py-[11px] font-sans text-sm text-brand-ink"
      />

      {uploadingImages && <p className="mt-2 text-xs text-tx-3">Subiendo captura…</p>}
      {uploadError && <p className="mt-2 text-xs text-brand-red">{uploadError}</p>}

      {draftImages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {draftImages.map((img) => (
            <div key={img.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-line-2 bg-panel-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview local de la captura recién adjuntada */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeDraftImage(img.id)}
                aria-label="Quitar captura"
                className={`absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-ink/80 text-[10px] leading-none text-[var(--bg)] transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] leading-[1.4] text-tx-3">
          Se envía a
          <br />
          <strong className="text-tx-2">{commentNotifyTo}</strong>
          <br />
          Cc: <strong className="text-tx-2">{commentNotifyCc}</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar captura"
            aria-label="Adjuntar captura"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line-2 bg-panel-2 text-tx-2 transition-[border-color,color,transform] duration-[400ms] hover:border-brand-blue hover:text-brand-blue ${PRESS_SCALE_CLASS}`}
          >
            <ImageIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addImageFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            className={`min-h-9 shrink-0 rounded bg-brand-ink px-3.5 text-[13px] font-bold whitespace-nowrap text-[var(--bg)] transition-transform duration-[400ms] desktop:min-h-11 desktop:px-[18px] ${PRESS_SCALE_CLASS}`}
          >
            Enviar comentario
          </button>
        </div>
      </div>

      {lightboxSrc && (
        <PhotoLightbox src={lightboxSrc} alt="Captura del comentario" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
