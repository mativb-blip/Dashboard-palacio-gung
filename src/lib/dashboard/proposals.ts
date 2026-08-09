import type { Proposal, ProposalStatus } from "@/types/dashboard";

/** Cantidad fija de casillas del checklist de aprobación por departamento
 * (ver CaptionPanel). */
export const DEPARTMENT_CHECK_COUNT = 1;

// Los destinatarios de notificación de comentarios ahora vienen de
// SiteSettings (ver site-settings.ts) — CommentsPanel los lee vía
// useBrand(), y addComment() en proposals-actions.ts vía getSiteSettings().

export function proposalsInPeriod(list: Proposal[], period: "month"): Proposal[] {
  void period; // única variante hoy: siempre filtra contra el mes calendario actual
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return list.filter((p) => p.date.startsWith(monthPrefix));
}

/** La primera línea del caption se usa como título de la propuesta. */
export function deriveTitle(caption: string): string {
  const firstLine = caption.split("\n")[0]?.trim();
  return firstLine || caption.trim().slice(0, 60) || "Sin título";
}

/** El status ya no se elige a mano — se deriva del checklist de
 * departamentos y del estado de los comentarios:
 * - Aprobado: la casilla marcada y (si hay comentarios) todos resueltos.
 * - Cambios solicitados: hay al menos un comentario y no califica para Aprobado.
 * - En revisión: todavía no hay nada de lo anterior. */
export function computeProposalStatus(proposal: Proposal): ProposalStatus {
  const approvals = proposal.departmentApprovals ?? [];
  const allDepartmentsApproved =
    approvals.length === DEPARTMENT_CHECK_COUNT && approvals.every(Boolean);
  const hasComments = proposal.comments.length > 0;
  const allCommentsResolved = proposal.comments.every((c) => c.resolved);

  if (allDepartmentsApproved && (!hasComments || allCommentsResolved)) return "Aprobado";
  if (hasComments) return "Cambios solicitados";
  return "En revisión";
}
