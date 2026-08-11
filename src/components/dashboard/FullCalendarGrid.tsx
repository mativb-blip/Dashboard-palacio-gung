"use client";

import Link from "next/link";
import { useState } from "react";
import type { DragEvent } from "react";
import { isoFromDate, todayIso, toneHex, WEEKDAY_ABBR } from "@/lib/dashboard/format";
import type { MonthGridCell } from "@/lib/dashboard/format";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal } from "@/types/dashboard";

interface FullCalendarGridProps {
  cells: MonthGridCell[];
  proposals: Proposal[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onOpenProposal: (id: string) => void;
  onMoveProposal: (id: string, newDate: string) => void;
  canEdit: boolean;
}

/** Tipo MIME propio para el drag de un post — evita reaccionar a un drag
 * ajeno (ej. una imagen arrastrada desde otra pestaña) que también deje
 * texto plano en el dataTransfer. */
const DRAG_MIME = "application/x-proposal-id";

// Todos los casilleros miden lo mismo sin importar cuántas propuestas tenga
// el día — nunca "el 15 de julio" hace más alta su fila que el resto del
// mes. Lo que cambia es cuánto entra: hasta 3 chips compactos de una línea:
// más allá de eso, un "+N más" en vez de romper la altura fija.
const MAX_VISIBLE_DESKTOP = 3;

/** En mobile la grilla es solo día + puntos de color (como el mes de
 * Calendario de iOS) — tocar un día lo selecciona y su detalle aparece en
 * el DayAgenda debajo, en vez de amontonar tarjetas completas en columnas
 * de ~50px. Desktop no cambia: sigue mostrando la tarjeta de cada propuesta
 * dentro del casillero. Son dos sub-árboles (`desktop:hidden` /
 * `hidden desktop:flex`), nunca los dos montados de forma interactiva a la
 * vez, así que no hay botones anidados ni contenido duplicado para lectores
 * de pantalla (display:none los saca del árbol de accesibilidad). */
export default function FullCalendarGrid({
  cells,
  proposals,
  selectedDate,
  onSelectDate,
  onOpenProposal,
  onMoveProposal,
  canEdit,
}: FullCalendarGridProps) {
  const currentIso = todayIso();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>, iso: string) {
    e.preventDefault();
    setDragOverIso(null);
    if (!canEdit) return;
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) onMoveProposal(id, iso);
  }

  return (
    <div className="overflow-hidden rounded border border-line-2">
      <div className="grid grid-cols-7 border-b border-line-2 bg-panel-2">
        {WEEKDAY_ABBR.map((label) => (
          <div
            key={label}
            className="px-1 py-1.5 text-center text-[9px] font-bold tracking-label text-tx-3 uppercase desktop:px-3 desktop:py-2 desktop:text-left desktop:text-[11px] desktop:tracking-label"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }) => {
          const iso = isoFromDate(date);
          const isToday = iso === currentIso;
          const isSelected = iso === selectedDate;
          // Un día puede tener más de un post cargado.
          const dayProposals = proposals.filter((p) => p.date === iso);
          const isDropTarget = dragOverIso === iso;
          return (
            <div
              key={iso}
              onDragOver={(e) => {
                if (!canEdit || !e.dataTransfer.types.includes(DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverIso(iso);
              }}
              onDragLeave={() => setDragOverIso((cur) => (cur === iso ? null : cur))}
              onDrop={(e) => handleDrop(e, iso)}
              className={`border-t border-r border-line first:border-l transition-colors duration-[400ms] ${
                isDropTarget ? "bg-brand-blue/[0.08]" : inMonth ? "bg-panel-2" : "bg-[var(--bg)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDate(iso)}
                disabled={!inMonth}
                aria-pressed={isSelected}
                aria-label={`${date.getDate()}${dayProposals.length ? `, ${dayProposals.length} propuesta(s)` : ""}`}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-1 py-1 transition-colors duration-[400ms] desktop:hidden ${PRESS_SCALE_CLASS} ${
                  isSelected ? "bg-brand-blue/[0.08]" : ""
                } ${!inMonth ? "cursor-default" : ""}`}
              >
                <span
                  className={`text-[11px] font-bold ${
                    isToday
                      ? "flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-red text-white"
                      : inMonth
                        ? "text-brand-ink"
                        : "text-tx-3"
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayProposals.length > 0 && (
                  <span className="flex gap-0.5">
                    {dayProposals.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: toneHex(p.format) }}
                      />
                    ))}
                  </span>
                )}
              </button>

              <div className="group hidden h-[108px] flex-col gap-1 px-2 py-2 desktop:flex">
                <div className="flex shrink-0 items-center justify-between gap-1">
                  {inMonth && canEdit ? <NewPostLink iso={iso} /> : <span className="h-5 w-5" />}
                  <span
                    className={`text-xs font-bold ${
                      isToday
                        ? "flex h-[20px] w-[20px] items-center justify-center rounded-full bg-brand-red text-white"
                        : inMonth
                          ? "text-brand-ink"
                          : "text-tx-3"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                  {dayProposals.slice(0, MAX_VISIBLE_DESKTOP).map((proposal) => (
                    <EventChip
                      key={proposal.id}
                      proposal={proposal}
                      onOpen={() => onOpenProposal(proposal.id)}
                      isDragging={draggingId === proposal.id}
                      onDragStart={() => setDraggingId(proposal.id)}
                      onDragEnd={() => setDraggingId(null)}
                      draggable={canEdit}
                    />
                  ))}
                  {dayProposals.length > MAX_VISIBLE_DESKTOP && (
                    <span className="px-1 text-[9px] font-bold text-tx-3">
                      +{dayProposals.length - MAX_VISIBLE_DESKTOP} más
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Fila de una línea — cabe hasta MAX_VISIBLE_DESKTOP dentro del casillero
 * de altura fija, sin importar cuántas propuestas tenga el día. El detalle
 * completo (formato, estado, comentarios) sigue estando a un click, en el
 * modal que abre `onOpen`. Arrastrable a otro día (ver DRAG_MIME arriba). */
function EventChip({
  proposal,
  onOpen,
  isDragging,
  onDragStart,
  onDragEnd,
  draggable,
}: {
  proposal: Proposal;
  onOpen: () => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  draggable: boolean;
}) {
  const hex = toneHex(proposal.format);
  return (
    <button
      type="button"
      draggable={draggable}
      onClick={onOpen}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, proposal.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={draggable ? `Arrastrar para reprogramar "${proposal.title}"` : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-sm border border-line-2 bg-panel-2 px-1.5 py-0.5 text-left transition-[border-color,transform,opacity] duration-[400ms] hover:border-brand-blue ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${PRESS_SCALE_CLASS} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hex }} />
      <span className="truncate text-[10px] leading-tight font-bold text-brand-ink">{proposal.title}</span>
    </button>
  );
}

/** Siempre presente (haya o no posts ese día) — permite cargar más de uno
 * por día — pero invisible hasta que se pasa el mouse por el casillero
 * (`.group` en el div padre). ~25 círculos de "+" viendo fijo en cada mes
 * era ruido visual permanente por una acción que se usa rara vez; ahora la
 * grilla se lee limpia y el botón aparece justo cuando hace falta. Sigue
 * siendo alcanzable por teclado (focus no depende del hover). Solo
 * desktop: en mobile el CTA de agregar vive una vez en el DayAgenda. */
function NewPostLink({ iso }: { iso: string }) {
  return (
    <Link
      href={`/nueva-propuesta?date=${iso}`}
      title="Cargar contenido para este día"
      aria-label="Cargar contenido para este día"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 text-tx-3 opacity-0 transition-[opacity,border-color,color] duration-[400ms] group-hover:opacity-100 hover:border-brand-blue hover:text-brand-blue focus-visible:opacity-100 ${PRESS_SCALE_CLASS}`}
    >
      <PlusIcon className="h-3 w-3" />
    </Link>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
