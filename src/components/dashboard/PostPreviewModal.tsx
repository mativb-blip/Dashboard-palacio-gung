"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import CommentsPanel, { type AddCommentInput } from "./CommentsPanel";
import { dateLong, isVerticalFormat, statusPillStyle } from "@/lib/dashboard/format";
import { computeProposalStatus } from "@/lib/dashboard/proposals";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";

interface PostPreviewModalProps {
  proposal: Proposal;
  onClose: () => void;
  onAddComment: (input: AddCommentInput) => void | Promise<void>;
  onToggleCommentResolved: (commentId: string) => void;
  onDeleteProposal: (id: string) => void;
}

/** Previsualización de un post desde el calendario — imagen respetando su
 * relación de aspecto real (sin recortar) + caption, con un botón flotante
 * de "Comentar" que despliega el mismo panel de comentarios del panel
 * principal. */
export default function PostPreviewModal({
  proposal,
  onClose,
  onAddComment,
  onToggleCommentResolved,
  onDeleteProposal,
}: PostPreviewModalProps) {
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const [showComments, setShowComments] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);
  const vertical = isVerticalFormat(proposal.format);
  const aspect = vertical ? "9 / 16" : (proposal.aspect ?? "4/5").replace("/", " / ");
  const status = computeProposalStatus(proposal);
  const statusStyle = statusPillStyle(status);
  const hasImage = Boolean(proposal.images?.[0]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleToggleComments() {
    const opening = !showComments;
    setShowComments(opening);
    if (opening) {
      // Esperar al render del panel (recién montado, todavía no mide su
      // tamaño real) antes de desplazar hasta la casilla de comentario.
      requestAnimationFrame(() => {
        commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }

  function handleDelete() {
    if (window.confirm(`¿Borrar "${proposal.title}"? Esta acción no se puede deshacer.`)) {
      onDeleteProposal(proposal.id);
    }
  }

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong modal-card-in relative flex max-h-[90vh] w-full max-w-[420px] flex-col overflow-hidden rounded-lg border border-line-2 font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] tracking-label text-tx-3 uppercase">{dateLong(proposal.date)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {canEdit && (
              <button
                type="button"
                onClick={handleDelete}
                title="Borrar propuesta"
                aria-label="Borrar propuesta"
                className={`text-tx-3 transition-transform duration-[400ms] hover:text-brand-red ${PRESS_SCALE_CLASS}`}
              >
                <TrashIcon />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className={`text-lg leading-none text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="relative w-full bg-panel-2" style={{ aspectRatio: aspect }}>
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview de contenido cargado por el usuario
              <img
                src={proposal.images?.[0]}
                alt={proposal.title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-tx-3">
                Sin arte cargado
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
            <span
              className="inline-flex items-center rounded-sm border px-2 py-1 text-[10px] leading-none font-bold tracking-label uppercase"
              style={{
                background: statusStyle.background,
                color: statusStyle.color,
                borderColor: statusStyle.borderColor,
              }}
            >
              {status}
            </span>
            <span className="text-xs text-tx-3">
              {proposal.network} · Publica {proposal.time}
            </span>
          </div>

          <p className="px-3 pb-4 text-sm leading-[1.5] whitespace-pre-line">{proposal.caption}</p>

          {showComments && (
            // pb-16 (no en CommentsPanel, que también se usa sin el botón
            // flotante) — el "Comentar" de abajo es `absolute` sobre esta
            // misma tarjeta y no scrollea con el contenido, así que sin este
            // colchón el scrollIntoView("end") deja el botón "Enviar
            // comentario" tapado justo detrás de él.
            <div ref={commentsRef} className="border-t border-line pb-16">
              <CommentsPanel
                proposal={proposal}
                onAddComment={onAddComment}
                onToggleCommentResolved={onToggleCommentResolved}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleToggleComments}
          className={`absolute right-4 bottom-4 flex h-11 items-center gap-2 rounded-full bg-brand-blue px-4 text-xs font-bold whitespace-nowrap text-[var(--bg)] shadow-lg transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          <CommentIcon />
          {proposal.comments.length > 0 ? `Comentar (${proposal.comments.length})` : "Comentar"}
        </button>
      </div>
    </div>
  );
}

function CommentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
