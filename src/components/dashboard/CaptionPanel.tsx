"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import VersionHistoryModal from "./VersionHistoryModal";
import { dateLong, statusPillStyle } from "@/lib/dashboard/format";
import { computeProposalStatus, DEPARTMENT_CHECK_COUNT } from "@/lib/dashboard/proposals";
import { canEditContent, handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";

interface CaptionPanelProps {
  proposal: Proposal;
  onUpdateProposal: (id: string, patch: Partial<Proposal>) => void;
  onDeleteProposal: (id: string) => void;
}

export default function CaptionPanel({ proposal, onUpdateProposal, onDeleteProposal }: CaptionPanelProps) {
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(proposal.caption);
  const [showHistory, setShowHistory] = useState(false);
  const departmentApprovals = proposal.departmentApprovals ?? Array(DEPARTMENT_CHECK_COUNT).fill(false);

  // Aprobar no es "editar contenido" — Jun es Comentarista y es quien de
  // verdad aprueba, así que esto no depende de canEdit (a diferencia de
  // borrar/editar caption, más abajo).
  function toggleDepartment(index: number) {
    const next = departmentApprovals.map((value, i) => (i === index ? !value : value));
    onUpdateProposal(proposal.id, { departmentApprovals: next });
  }

  function handleDelete() {
    if (window.confirm(`¿Borrar "${proposal.title}"? Esta acción no se puede deshacer.`)) {
      onDeleteProposal(proposal.id);
    }
  }

  function handleStartEdit() {
    setDraft(proposal.caption);
    setEditing(true);
  }

  function handleCancelEdit() {
    setDraft(proposal.caption);
    setEditing(false);
  }

  function handleSaveEdit() {
    onUpdateProposal(proposal.id, { caption: draft.trim() });
    setEditing(false);
  }

  async function handleCopy() {
    const text = `${proposal.caption}\n\n${proposal.hashtags}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const status = computeProposalStatus(proposal);
  const statusStyle = statusPillStyle(status);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="text-[11px] tracking-label text-tx-3 uppercase">
            {dateLong(proposal.date)}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              onPointerEnter={handleLiquidPointerEnter}
              title="Borrar propuesta"
              aria-label="Borrar propuesta"
              className={`${iconButtonClass} shrink-0`}
            >
              <TrashIcon className="relative" />
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <span
            className="inline-flex items-center rounded-sm border px-2.5 py-1.5 text-[11px] leading-none font-bold tracking-label uppercase"
            style={{
              background: statusStyle.background,
              color: statusStyle.color,
              borderColor: statusStyle.borderColor,
            }}
          >
            {status}
          </span>
          <span className="text-[13px] text-tx-2">Publica {proposal.time}</span>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className={`text-[11px] font-bold text-brand-blue underline-offset-2 hover:underline ${PRESS_SCALE_CLASS}`}
          >
            Ver historial
          </button>
        </div>

        {proposal.approvalInvalidatedReason && (
          <div
            className="mt-2.5 rounded border px-2.5 py-2 text-xs leading-[1.4]"
            style={{
              borderColor: "var(--color-amber-border)",
              background: "var(--color-amber-bg)",
              color: "var(--color-amber-text)",
            }}
          >
            {proposal.approvalInvalidatedReason}
          </div>
        )}

        <div className="mt-3">
          <span className="mb-1.5 block text-[10px] font-bold tracking-label text-tx-3 uppercase">
            Pilar de contenido
          </span>
          <p className="text-xs text-brand-ink">{proposal.contentPillar || "Sin categorizar"}</p>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold tracking-label text-tx-3 uppercase">
              Aprobación por departamento
            </span>
            <span className="text-[10px] font-bold text-tx-3 tabular-nums">
              {departmentApprovals.filter(Boolean).length}/{DEPARTMENT_CHECK_COUNT}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {departmentApprovals.map((checked, i) => {
              const label = "Jun";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDepartment(i)}
                  aria-pressed={checked}
                  title={checked ? `${label} · aprobado` : `${label} · pendiente`}
                  className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-1 text-[10px] leading-none font-bold tracking-label uppercase transition-[color,border-color,background-color] duration-[400ms] disabled:cursor-default ${PRESS_SCALE_CLASS} ${
                    checked
                      ? "border-brand-blue bg-brand-blue/[0.05] text-brand-blue"
                      : "border-line-2 bg-transparent text-[var(--color-brand-red-text)] hover:border-brand-red/40"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[400ms] ${
                      checked ? "border-brand-blue bg-brand-blue" : "border-brand-red/50"
                    }`}
                  >
                    {checked && <CheckIcon className="check-pop-in h-2.5 w-2.5 text-[var(--bg)]" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-px bg-line" />

      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[11px] tracking-label text-tx-3 uppercase">Caption propuesto</div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  Guardar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  onPointerEnter={handleLiquidPointerEnter}
                  title={copied ? "Copiado ✓" : "Copiar caption"}
                  aria-label={copied ? "Copiado" : "Copiar caption"}
                  className={`${iconButtonClass}${copied ? " border-brand-blue bg-brand-blue/[0.06] text-brand-blue" : ""}`}
                >
                  {copied ? (
                    <CheckIcon key="copied" className="art-fade-in relative" />
                  ) : (
                    <ClipboardIcon key="idle" className="relative" />
                  )}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    onPointerEnter={handleLiquidPointerEnter}
                    title="Editar caption"
                    aria-label="Editar caption"
                    className={iconButtonClass}
                  >
                    <PencilIcon className="relative" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-32 w-full resize-y rounded border border-line-2 bg-panel-2 px-3 py-2 text-[15px] leading-[1.5] text-brand-ink"
          />
        ) : (
          <>
            <p className="mb-3 text-[15px] leading-[1.62] whitespace-pre-line text-brand-ink">
              {proposal.caption}
            </p>
            <div className="text-sm leading-[1.6] font-bold text-brand-blue">{proposal.hashtags}</div>
          </>
        )}
      </div>

      {showHistory && <VersionHistoryModal proposal={proposal} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}
