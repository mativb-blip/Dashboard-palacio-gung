"use client";

import { daysOfMonth, isoFromDate, MONTHS_SHORT, toneHex, weekdayAbbr, YEAR } from "@/lib/dashboard/format";
import { handleLiquidPointerEnter, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";
import FormatIcon from "./FormatIcon";

interface CalendarProps {
  proposals: Proposal[];
  selectedProposalId: string;
  onSelectProposal: (id: string) => void;
  onSelectEmptyDate: (iso: string) => void;
  selectedMonth: number;
  onSelectedMonthChange: (month: number) => void;
}

export default function Calendar({
  proposals,
  selectedProposalId,
  onSelectProposal,
  onSelectEmptyDate,
  selectedMonth,
  onSelectedMonthChange,
}: CalendarProps) {
  const monthDays = daysOfMonth(YEAR, selectedMonth);
  return (
    <div>
      <div className="mb-1 flex h-4 gap-[3px]">
        {MONTHS_SHORT.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectedMonthChange(i)}
            className={`flex-1 rounded-sm text-[8px] leading-none font-bold tracking-label uppercase transition-[background-color,color,transform] duration-[400ms] ${PRESS_SCALE_CLASS} ${
              i === selectedMonth ? "bg-brand-blue text-[var(--bg)]" : "bg-panel-2 text-tx-3"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="box-border flex h-[60px] items-stretch gap-[5px]">
        {monthDays.map((date) => {
          const iso = isoFromDate(date);
          const dayProposals = proposals.filter((p) => p.date === iso);
          const active = dayProposals.some((p) => p.id === selectedProposalId);
          return (
            <button
              key={iso}
              type="button"
              onClick={() =>
                dayProposals.length ? onSelectProposal(dayProposals[0].id) : onSelectEmptyDate(iso)
              }
              onPointerEnter={handleLiquidPointerEnter}
              title={
                dayProposals.length > 1
                  ? `${dayProposals.length} posts este día`
                  : dayProposals.length === 0
                    ? "Cargar contenido para este día"
                    : undefined
              }
              className={[
                // Ancho fijo y sin encoger en mobile: con 31 columnas, dejarlas
                // repartirse (flex-1) dentro de un contenedor que no siempre
                // fuerza scroll (min-width:660 puede quedar corto en anchos
                // intermedios, p. ej. una tablet) las aplastaría ilegibles.
                // En desktop sí se reparten a lo ancho, como el resto del layout.
                //
                // El "líquido" es antes del contenido en el arbol (::before) para que
                // la fecha/ícono queden por encima sin necesitar z-index explícito —
                // basta con `relative` en esos spans (ver stacking order de CSS 2.1 §E:
                // los descendientes posicionados con z-index:auto se pintan en orden de
                // documento, y el pseudo-elemento siempre es el primero de ese grupo).
                `relative flex w-9 shrink-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded border px-[5px] py-1.5 text-left font-sans transition-[background-color,border-color,transform] duration-[400ms] motion-safe:hover:scale-[1.02] before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:bg-brand-blue/15 before:[clip-path:circle(0%_at_var(--hx,50%)_var(--hy,50%))] before:transition-[clip-path] before:duration-[400ms] before:ease-out motion-safe:hover:before:[clip-path:circle(150%_at_var(--hx,50%)_var(--hy,50%))] desktop:w-auto desktop:min-w-0 desktop:flex-1 ${PRESS_SCALE_CLASS}`,
                // Antes: vacío = gris, con contenido = blanco ("pop"). Con
                // el tema oscuro el mismo criterio se invierte: vacío se
                // funde con --bg, con contenido "aparece" en --surface —
                // si ambos usaran bg-panel-2 se perdería la jerarquía.
                active
                  ? "border-brand-blue bg-brand-blue/[0.06]"
                  : dayProposals.length
                    ? "border-line bg-panel-2"
                    : "border-line bg-[var(--bg)] hover:border-brand-blue",
              ].join(" ")}
            >
              <span className="relative text-[9px] tracking-label text-tx-3 uppercase">
                {weekdayAbbr(iso)}
              </span>
              <span
                className={`relative text-sm leading-none font-bold ${dayProposals.length ? "text-brand-red" : "text-tx-3"}`}
              >
                {date.getDate()}
              </span>
              <span className="relative flex w-full flex-1 items-center justify-center gap-[2px] overflow-hidden">
                {dayProposals.length === 0 ? (
                  <PlusIcon className="h-3.5 w-3.5 text-tx-3" />
                ) : dayProposals.length === 1 ? (
                  <FormatIcon
                    format={dayProposals[0].format}
                    className="h-4 w-4"
                    style={{ color: toneHex(dayProposals[0].format) }}
                  />
                ) : (
                  <>
                    {dayProposals.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{ background: toneHex(p.format) }}
                      />
                    ))}
                    {dayProposals.length > 3 && (
                      <span className="text-[7px] leading-none font-bold text-tx-3">
                        +{dayProposals.length - 3}
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
