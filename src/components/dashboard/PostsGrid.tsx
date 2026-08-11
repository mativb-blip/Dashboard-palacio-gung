"use client";

import { useSession } from "next-auth/react";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";
import ArtTile from "./ArtTile";
import FormatIcon from "./FormatIcon";

interface PostsGridProps {
  proposals: Proposal[];
  onSelectProposal: (id: string) => void;
  onDeleteProposal: (id: string) => void;
}

/** Feed estilo Instagram: 3 columnas, todos los posts sin importar el mes,
 * más recientes arriba. */
export default function PostsGrid({ proposals, onSelectProposal, onDeleteProposal }: PostsGridProps) {
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const sorted = [...proposals].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  function handleDelete(proposal: Proposal) {
    if (window.confirm(`¿Borrar "${proposal.title}"? Esta acción no se puede deshacer.`)) {
      onDeleteProposal(proposal.id);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-[18px] desktop:mx-auto desktop:w-full desktop:max-w-[60%] desktop:px-8 desktop:py-[26px]">
      {sorted.length === 0 ? (
        <p className="text-sm text-tx-3">No hay propuestas cargadas todavía.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {sorted.map((proposal) => {
            return (
              <div
                key={proposal.id}
                style={{ aspectRatio: "1080 / 1350" }}
                className="relative overflow-hidden bg-panel-2"
              >
                <button
                  type="button"
                  onClick={() => onSelectProposal(proposal.id)}
                  className={`absolute inset-0 h-full w-full transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  {proposal.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura de contenido cargado por el usuario
                    <img
                      src={proposal.images[0]}
                      alt={proposal.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ArtTile
                      n="01"
                      total={String(proposal.artN).padStart(2, "0")}
                      label={proposal.title}
                      dimension={proposal.dim ?? "1080 × 1080 px"}
                    />
                  )}
                  {proposal.format !== "Post simple" && (
                    <span className="absolute top-1.5 right-1.5 text-white drop-shadow">
                      <FormatIcon format={proposal.format} className="h-4 w-4" />
                    </span>
                  )}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(proposal)}
                    title="Borrar propuesta"
                    aria-label="Borrar propuesta"
                    className={`absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded bg-black/45 text-white backdrop-blur-sm transition-transform duration-[400ms] hover:bg-brand-red ${PRESS_SCALE_CLASS}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
