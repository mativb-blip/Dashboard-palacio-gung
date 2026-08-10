"use client";

import { useEffect, useState } from "react";
import { getProposalVersions } from "@/lib/dashboard/proposals-actions";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal, ProposalVersionEntry } from "@/types/dashboard";

interface VersionHistoryModalProps {
  proposal: Proposal;
  onClose: () => void;
}

/** "Antes" (una versión pasada, elegida de una lista) / "Ahora" (el estado
 * vigente de la propuesta) en paralelo — sin diff, alcanza con mostrar las
 * dos versiones completas (ver ficha 5). */
export default function VersionHistoryModal({ proposal, onClose }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<ProposalVersionEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProposalVersions(proposal.id).then((data) => {
      if (cancelled) return;
      setVersions(data);
      setSelectedId(data[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [proposal.id]);

  const selected = versions?.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="modal-card-in flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line-2 bg-panel-2 font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Historial de versiones</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`text-lg leading-none text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            ×
          </button>
        </div>

        {versions === null ? (
          <p className="px-4 py-8 text-center text-sm text-tx-3">Cargando…</p>
        ) : versions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tx-3">Todavía no hay ediciones registradas.</p>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto desktop:flex-row desktop:overflow-hidden">
            <div className="flex shrink-0 flex-row gap-1.5 overflow-x-auto border-b border-line p-2 desktop:w-48 desktop:flex-col desktop:overflow-y-auto desktop:border-r desktop:border-b-0">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`shrink-0 rounded px-2.5 py-2 text-left text-xs transition-colors duration-[400ms] ${
                    v.id === selectedId ? "bg-panel-2 font-bold text-brand-blue" : "text-tx-2 hover:bg-panel-2"
                  }`}
                >
                  <div className="whitespace-nowrap">{v.when}</div>
                  <div className="truncate text-tx-3">{v.editedBy}</div>
                </button>
              ))}
            </div>

            {selected && (
              <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 desktop:grid-cols-2">
                <VersionColumn label={`Antes (${selected.when} · ${selected.editedBy})`} entry={selected} />
                <VersionColumn label="Ahora" entry={proposal} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VersionColumn({
  label,
  entry,
}: {
  label: string;
  entry: { caption: string; images?: string[]; video?: string };
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-line-2 p-3">
      <div className="text-[10px] font-bold tracking-label text-tx-3 uppercase">{label}</div>
      {entry.images?.[0] || entry.video ? (
        <div className="relative aspect-square w-full overflow-hidden rounded bg-panel-2">
          {entry.video ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- comparación interna, sin subtítulos que aportar
            <video src={entry.video} className="h-full w-full object-contain" controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- comparación de versiones, no un asset del sitio
            <img src={entry.images?.[0]} alt="" className="h-full w-full object-contain" />
          )}
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded bg-panel-2 text-xs text-tx-3">
          Sin arte
        </div>
      )}
      <p className="text-sm leading-[1.5] whitespace-pre-line">{entry.caption}</p>
    </div>
  );
}
