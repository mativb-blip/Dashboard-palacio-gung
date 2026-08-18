"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ArtViewer from "@/components/dashboard/ArtViewer";
import Calendar from "@/components/dashboard/Calendar";
import CaptionPanel from "@/components/dashboard/CaptionPanel";
import CommentsPanel, { type AddCommentInput } from "@/components/dashboard/CommentsPanel";
import PostsGrid from "@/components/dashboard/PostsGrid";
import Topbar from "@/components/dashboard/Topbar";
import {
  addComment,
  deleteProposal,
  getProposals,
  toggleCommentResolved,
  updateProposal,
} from "@/lib/dashboard/proposals-actions";
import { applyUpdateResult, proposalsInPeriod } from "@/lib/dashboard/proposals";
import { dateLong, todayIso } from "@/lib/dashboard/format";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { useBrand } from "@/lib/dashboard/BrandContext";
import type { Gallery, Period, Proposal } from "@/types/dashboard";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <DashboardHome />
    </Suspense>
  );
}

function DashboardHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(searchParams.get("period") === "grid" ? "grid" : "month");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedProposalId, setSelectedProposalId] = useState(searchParams.get("proposal"));
  const [artIndex, setArtIndex] = useState(0);
  const [gallery, setGallery] = useState<Gallery>("slider");
  const today = todayIso();
  const { brandName } = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);

  // Carga desde la base recién montado el componente (Server Components no
  // mezclan bien con todo el estado de interacción de esta pantalla — ver
  // decisión del 2026-07-28 de mantenerla como client component y traer los
  // datos vía server action en vez de convertirla entera a Server Component).
  useEffect(() => {
    let cancelled = false;
    getProposals().then((data) => {
      if (cancelled) return;
      setProposals(data);
      // Al entrar, la vista Post arranca en la propuesta de HOY si existe —
      // nunca cae de vuelta a "la primera del mes" (eso mostraría un día
      // distinto al que dice el calendario). Sin post hoy: no se selecciona
      // ninguna, y el panel muestra el estado vacío en vez de contenido de
      // otro día.
      setSelectedProposalId((current) => {
        if (current && data.some((p) => p.id === current)) return current;
        return data.find((p) => p.date === today)?.id ?? null;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const selectedProposal = proposals.find((p) => p.id === selectedProposalId) ?? null;

  function handleSelectProposal(id: string) {
    setSelectedProposalId(id);
    setArtIndex(0);
  }

  function handleSelectEmptyDate(iso: string) {
    if (!canEdit) return;
    router.push(`/nueva-propuesta?date=${iso}`);
  }

  function handlePeriodChange(next: Period) {
    if (next === "grid") {
      setPeriod(next);
      return;
    }
    const list = proposalsInPeriod(proposals, next);
    const stillInRange = list.some((p) => p.id === selectedProposalId);
    setPeriod(next);
    if (!stillInRange && list[0]) {
      setSelectedProposalId(list[0].id);
      setArtIndex(0);
    }
  }

  function handleSelectFromGrid(id: string) {
    handleSelectProposal(id);
    setPeriod("month");
  }

  async function handleAddComment(input: AddCommentInput) {
    if (!selectedProposal) return;
    try {
      const saved = await addComment(selectedProposal.id, input);
      setProposals((prev) =>
        prev.map((p) => (p.id === selectedProposal.id ? { ...p, comments: [...p.comments, saved] } : p)),
      );
    } catch (e) {
      console.error(e);
    }
  }

  /** Patch solo local — lo usan las acciones que guardan por su cuenta (las
   * alternativas de caption y las músicas, ver CaptionPanel) y necesitan
   * volcar acá lo que el server ya persistió. */
  function handlePatchProposal(id: string, patch: Partial<Proposal>) {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function handleUpdateProposal(id: string, patch: Partial<Proposal>) {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const result = await updateProposal(id, {
        ...("caption" in patch ? { caption: patch.caption } : {}),
        ...("images" in patch ? { images: patch.images ?? [] } : {}),
        ...("video" in patch ? { video: patch.video ?? null } : {}),
        ...("artN" in patch ? { artN: patch.artN } : {}),
        ...("departmentApprovals" in patch ? { departmentApprovals: patch.departmentApprovals ?? [] } : {}),
      });
      // El server puede haber invalidado la aprobación (ficha 1) o limpiado
      // el aviso al re-aprobar — el patch optimista de arriba no lo sabía.
      setProposals((prev) => prev.map((p) => (p.id === id ? applyUpdateResult(p, result) : p)));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    }
  }

  function handleDeleteProposal(id: string) {
    setProposals((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (id === selectedProposalId) {
        const list = proposalsInPeriod(next, "month");
        setSelectedProposalId(list[0]?.id ?? next[0]?.id ?? null);
        setArtIndex(0);
      }
      return next;
    });
    deleteProposal(id).catch((e) => console.error(e));
  }

  function handleToggleCommentResolved(commentId: string) {
    if (!selectedProposal) return;
    setProposals((prev) =>
      prev.map((p) =>
        p.id === selectedProposal.id
          ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)) }
          : p,
      ),
    );
    toggleCommentResolved(commentId).catch((e) => console.error(e));
  }

  return (
    <div className="flex min-h-screen flex-col desktop:h-screen desktop:overflow-hidden">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view={period} onPeriodChange={handlePeriodChange} planLabel={brandName} />
      {canEdit && (
        <div className="flex justify-end px-4 pb-2 desktop:px-8">
          <Link
            href="/nueva-propuesta"
            className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            + Cargar propuesta
          </Link>
        </div>
      )}

      <div className="h-px shrink-0 bg-line" />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-tx-3">Cargando propuestas…</p>
        </div>
      ) : period === "grid" ? (
        <PostsGrid
          proposals={proposals}
          onSelectProposal={handleSelectFromGrid}
          onDeleteProposal={handleDeleteProposal}
        />
      ) : (
        <>
          <div className="shrink-0 overflow-x-auto px-4 py-[14px] desktop:px-8 desktop:pt-[18px] desktop:pb-[22px]">
            <div className="min-w-[660px] desktop:min-w-0 desktop:w-full">
              <Calendar
                proposals={proposals}
                selectedProposalId={selectedProposal?.id ?? ""}
                onSelectProposal={handleSelectProposal}
                onSelectEmptyDate={handleSelectEmptyDate}
                selectedMonth={selectedMonth}
                onSelectedMonthChange={setSelectedMonth}
                canEdit={canEdit}
              />
            </div>
          </div>
          <div className="h-px shrink-0 bg-line" />

          {!selectedProposal ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[11px] tracking-label text-tx-3 uppercase">{dateLong(today)}</p>
              <p className="text-sm text-tx-3">No hay contenido programado para hoy.</p>
              {canEdit && (
                <Link
                  href={`/nueva-propuesta?date=${today}`}
                  className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  + Cargar propuesta para hoy
                </Link>
              )}
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 desktop:min-h-0 desktop:grid-cols-[1.5fr_0.95fr]">
              <div className="border-b border-line px-4 py-[18px] desktop:overflow-y-auto desktop:border-r desktop:border-b-0 desktop:px-8 desktop:py-[26px]">
                <ArtViewer
                  key={`art-${selectedProposal.id}`}
                  proposal={selectedProposal}
                  dayProposals={proposals.filter((p) => p.date === selectedProposal.date)}
                  onSelectProposal={handleSelectProposal}
                  artIndex={artIndex}
                  onArtIndexChange={setArtIndex}
                  gallery={gallery}
                  onGalleryChange={setGallery}
                  onUpdateProposal={handleUpdateProposal}
                />
              </div>

              <aside className="flex flex-col gap-[18px] px-4 pt-[18px] pb-7 desktop:gap-5 desktop:overflow-y-auto desktop:px-8 desktop:py-[26px]">
                <CaptionPanel
                  key={`caption-${selectedProposal.id}`}
                  proposal={selectedProposal}
                  onUpdateProposal={handleUpdateProposal}
                  onPatchProposal={handlePatchProposal}
                  onDeleteProposal={handleDeleteProposal}
                />
                <div className="h-px bg-line" />
                <CommentsPanel
                  key={selectedProposal.id}
                  proposal={selectedProposal}
                  onAddComment={handleAddComment}
                  onToggleCommentResolved={handleToggleCommentResolved}
                />
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
