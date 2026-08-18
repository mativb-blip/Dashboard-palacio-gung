import type { Proposal, ProposalStatus } from "@/types/dashboard";

/** Cantidad fija de casillas del checklist de aprobación por departamento
 * (ver CaptionPanel). */
export const DEPARTMENT_CHECK_COUNT = 1;

/** Cuántas versiones anteriores de caption/media se conservan por propuesta
 * (ver ProposalVersion) antes de podar las más viejas. */
export const PROPOSAL_VERSION_LIMIT = 8;

/** Techo de alternativas de caption y de músicas por propuesta — no es un
 * límite técnico sino de lectura: Jun tiene que poder comparar las opciones
 * de un vistazo para elegir una. */
export const CAPTION_OPTIONS_LIMIT = 6;
export const MUSIC_OPTIONS_LIMIT = 6;

/** Con cuánta anticipación a la publicación se manda el recordatorio de
 * aprobación pendiente (ficha 3) — separado de los recordatorios de
 * publicación (schedule-time.ts), que son para el propio horario del post. */
export const APPROVAL_REMINDER_HOURS_BEFORE = 24;

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

/** El caller (handleUpdateProposal en page.tsx/calendario/page.tsx) actualiza
 * el estado local de forma optimista con el patch que pidió, pero
 * updateProposal() en el server puede pisar departmentApprovals/
 * approvalInvalidatedReason (una edición invalidó la aprobación vigente,
 * ver la ficha 1) — esto reconcilia esos dos campos con lo que el server
 * realmente terminó guardando. No toca nada más del patch optimista. */
export function applyUpdateResult<T extends Proposal>(
  proposal: T,
  result: { departmentApprovals?: boolean[]; approvalInvalidatedReason?: string | null },
): T {
  return {
    ...proposal,
    ...(result.departmentApprovals !== undefined ? { departmentApprovals: result.departmentApprovals } : {}),
    ...(result.approvalInvalidatedReason !== undefined
      ? { approvalInvalidatedReason: result.approvalInvalidatedReason ?? undefined }
      : {}),
  };
}

/** El status ya no se elige a mano — se deriva del checklist de
 * departamentos y del estado de los comentarios:
 * - Pendiente de re-aprobación: se aprobó, después se editó contenido, y
 *   todavía no se volvió a aprobar (ver approvalInvalidatedReason en
 *   updateProposal()) — tiene prioridad sobre Cambios solicitados/En
 *   revisión porque es una señal más específica ("esto YA se había
 *   aprobado y cambió") que simplemente no tener aprobación todavía.
 * - Aprobado: la casilla marcada y (si hay comentarios) todos resueltos.
 * - Cambios solicitados: hay al menos un comentario y no califica para Aprobado.
 * - En revisión: todavía no hay nada de lo anterior. */
export function computeProposalStatus(proposal: Proposal): ProposalStatus {
  const approvals = proposal.departmentApprovals ?? [];
  const allDepartmentsApproved =
    approvals.length === DEPARTMENT_CHECK_COUNT && approvals.every(Boolean);
  const hasComments = proposal.comments.length > 0;
  const allCommentsResolved = proposal.comments.every((c) => c.resolved);

  if (proposal.approvalInvalidatedReason && !allDepartmentsApproved) return "Pendiente de re-aprobación";
  if (allDepartmentsApproved && (!hasComments || allCommentsResolved)) return "Aprobado";
  if (hasComments) return "Cambios solicitados";
  return "En revisión";
}
