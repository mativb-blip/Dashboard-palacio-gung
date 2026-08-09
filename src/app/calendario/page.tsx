"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DayAgenda from "@/components/dashboard/DayAgenda";
import FullCalendarGrid from "@/components/dashboard/FullCalendarGrid";
import PostPreviewModal from "@/components/dashboard/PostPreviewModal";
import Topbar from "@/components/dashboard/Topbar";
import { currentPlanLabel, isoFromDate, MONTH_FULL, monthGridDays, todayIso } from "@/lib/dashboard/format";
import {
  addComment,
  deleteProposal,
  getProposals,
  toggleCommentResolved,
  updateProposal,
} from "@/lib/dashboard/proposals-actions";
import { applyUpdateResult } from "@/lib/dashboard/proposals";
import { handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { useBrand } from "@/lib/dashboard/BrandContext";
import type { AddCommentInput } from "@/components/dashboard/CommentsPanel";
import type { Proposal } from "@/types/dashboard";

/** Día preseleccionado al entrar a un mes — hoy si cae en ese mes, si no el 1°. */
function defaultSelectedDate(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === month) return todayIso();
  return isoFromDate(new Date(year, month, 1));
}

export default function CalendarioPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(() => defaultSelectedDate(now.getFullYear(), now.getMonth()));
  const [previewProposalId, setPreviewProposalId] = useState<string | null>(null);
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const { brandName, contentPillars } = useBrand();

  useEffect(() => {
    let cancelled = false;
    getProposals().then((data) => {
      if (cancelled) return;
      setProposals(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function goPrevMonth() {
    setCursor(({ year, month }) => {
      const next = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
      setSelectedDate(defaultSelectedDate(next.year, next.month));
      return next;
    });
  }

  function goNextMonth() {
    setCursor(({ year, month }) => {
      const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
      setSelectedDate(defaultSelectedDate(next.year, next.month));
      return next;
    });
  }

  async function handleAddComment(input: AddCommentInput) {
    if (!previewProposalId) return;
    try {
      const saved = await addComment(previewProposalId, input);
      setProposals((prev) =>
        prev.map((p) => (p.id === previewProposalId ? { ...p, comments: [...p.comments, saved] } : p)),
      );
    } catch (e) {
      console.error(e);
    }
  }

  async function handleMoveProposal(id: string, newDate: string) {
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal || proposal.date === newDate) return;
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, date: newDate } : p)));
    try {
      const result = await updateProposal(id, { date: newDate });
      // Mover la fecha de un post ya aprobado invalida esa aprobación (ficha
      // 1) — el patch optimista de arriba no sabía eso.
      setProposals((prev) => prev.map((p) => (p.id === id ? applyUpdateResult(p, result) : p)));
    } catch (e) {
      console.error(e);
      // Revertir en caso de error de red/servidor — no dejar la UI mintiendo.
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, date: proposal.date } : p)));
    }
  }

  function handleDeleteProposal(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
    if (id === previewProposalId) setPreviewProposalId(null);
    deleteProposal(id).catch((e) => console.error(e));
  }

  function handleToggleCommentResolved(commentId: string) {
    setProposals((prev) =>
      prev.map((p) =>
        p.id === previewProposalId
          ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)) }
          : p,
      ),
    );
    toggleCommentResolved(commentId).catch((e) => console.error(e));
  }

  const cells = monthGridDays(cursor.year, cursor.month);
  const previewProposal = proposals.find((p) => p.id === previewProposalId) ?? null;
  const filteredProposals =
    pillarFilter === "all" ? proposals : proposals.filter((p) => p.contentPillar === pillarFilter);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="calendario" planLabel={currentPlanLabel(brandName)} />
      <div className="flex justify-start px-4 pb-2 desktop:px-8">
        <Link
          href="/"
          className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al panel
        </Link>
      </div>
      <div className="h-px shrink-0 bg-line" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 desktop:px-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold capitalize">
            {MONTH_FULL[cursor.month]} {cursor.year}
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-tx-3">
              Pilar
              <select
                value={pillarFilter}
                onChange={(e) => setPillarFilter(e.target.value)}
                className="rounded border border-line-2 bg-white px-2 py-1 text-xs text-brand-ink"
              >
                <option value="all">Todos</option>
                {contentPillars.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevMonth}
                onPointerEnter={handleLiquidPointerEnter}
                aria-label="Mes anterior"
                className={iconButtonClass}
              >
                <span className="relative">‹</span>
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                onPointerEnter={handleLiquidPointerEnter}
                aria-label="Mes siguiente"
                className={iconButtonClass}
              >
                <span className="relative">›</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-tx-3">Cargando propuestas…</p>
        ) : (
          <>
            <FullCalendarGrid
              cells={cells}
              proposals={filteredProposals}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onOpenProposal={setPreviewProposalId}
              onMoveProposal={handleMoveProposal}
            />

            <DayAgenda
              dateIso={selectedDate}
              proposals={filteredProposals.filter((p) => p.date === selectedDate)}
              onOpenProposal={setPreviewProposalId}
            />
          </>
        )}
      </div>

      {previewProposal && (
        <PostPreviewModal
          key={previewProposal.id}
          proposal={previewProposal}
          onClose={() => setPreviewProposalId(null)}
          onAddComment={handleAddComment}
          onToggleCommentResolved={handleToggleCommentResolved}
          onDeleteProposal={handleDeleteProposal}
        />
      )}
    </div>
  );
}
