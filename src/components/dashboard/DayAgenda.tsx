"use client";

import Link from "next/link";
import { dateLong, fmtShort, statusPillStyle, toneHex } from "@/lib/dashboard/format";
import { computeProposalStatus } from "@/lib/dashboard/proposals";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";

interface DayAgendaProps {
  dateIso: string;
  proposals: Proposal[];
  onOpenProposal: (id: string) => void;
}

/** Detalle del día seleccionado en la grilla mensual — solo mobile
 * (`desktop:hidden`; en desktop cada casillero ya muestra su propia
 * tarjeta). Reemplaza los ~30 botones "+" de 20px repartidos por la
 * grilla por un único CTA de 44px, atado al día que se está mirando. */
export default function DayAgenda({ dateIso, proposals, onOpenProposal }: DayAgendaProps) {
  return (
    <div className="desktop:hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <h3 className="text-sm font-bold capitalize">{dateLong(dateIso)}</h3>
        <Link
          href={`/nueva-propuesta?date=${dateIso}`}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-ink px-4 text-xs font-bold whitespace-nowrap text-white transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
        >
          <PlusIcon />
          Cargar
        </Link>
      </div>

      <div className="flex flex-col gap-2 pt-3">
        {proposals.length === 0 ? (
          <p className="py-6 text-center text-sm text-tx-3 italic">Sin propuestas este día.</p>
        ) : (
          proposals.map((proposal) => {
            const status = computeProposalStatus(proposal);
            const statusStyle = statusPillStyle(status);
            const hex = toneHex(proposal.format);
            return (
              <button
                key={proposal.id}
                type="button"
                onClick={() => onOpenProposal(proposal.id)}
                className={`flex flex-col gap-1.5 rounded border border-line-2 bg-white px-3 py-2.5 text-left transition-[border-color,transform] duration-150 hover:border-brand-blue ${PRESS_SCALE_CLASS}`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: hex }} />
                  <span className="text-sm leading-[1.3] font-bold text-brand-ink">{proposal.title}</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  <span className="text-[10px] font-bold tracking-[0.1em] text-tx-3 uppercase">
                    {fmtShort(proposal.format)} · {proposal.time}
                  </span>
                  <span
                    className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] leading-none font-bold tracking-[0.04em] uppercase"
                    style={{
                      background: statusStyle.background,
                      color: statusStyle.color,
                      borderColor: statusStyle.borderColor,
                    }}
                  >
                    {status}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
