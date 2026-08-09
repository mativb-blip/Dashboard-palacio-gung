export type Period = "month" | "grid";

export type Gallery = "slider" | "grid";

export type ProposalFormat = "Carrusel" | "Reel" | "Historia" | "Post simple";

export type ProposalStatus =
  | "Aprobado"
  | "Cambios solicitados"
  | "En revisión"
  | "Pendiente de re-aprobación";

export interface ProposalComment {
  /** Id real de la fila en la base — antes se identificaba por índice en el
   * array, lo que rompía apenas los comentarios vivían en una tabla propia. */
  id: string;
  /** "general" o el índice del arte (como string) al que aplica el comentario */
  scope: "general" | string;
  author: string;
  text: string;
  /** Capturas de pantalla adjuntas — data URLs base64. */
  images?: string[];
  when: string;
  avatarBg: string;
  resolved?: boolean;
}

export interface Proposal {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time: string;
  network: string;
  format: ProposalFormat;
  status: ProposalStatus;
  title: string;
  caption: string;
  hashtags: string;
  artN: number;
  comments: ProposalComment[];
  images?: string[];
  /** Video del Reel (data URL) — la portada se guarda en `images[0]`. */
  video?: string;
  aspect?: string;
  dim?: string;
  /** Checklist de aprobación por departamento (ver DEPARTMENT_CHECK_COUNT). */
  departmentApprovals?: boolean[];
  /** Pilar de contenido — string libre validado server-side, ver
   * brand.contentPillars. undefined = sin categorizar. */
  contentPillar?: string;
  /** Motivo por el que una aprobación previa quedó invalidada (ver
   * computeProposalStatus) — undefined = nunca se invalidó, o ya se
   * volvió a aprobar. */
  approvalInvalidatedReason?: string;
}

/** Snapshot de una versión anterior del caption/media de una propuesta —
 * ver ProposalVersion en el schema y "Ver historial" en CaptionPanel. */
export interface ProposalVersionEntry {
  id: string;
  caption: string;
  images?: string[];
  video?: string;
  editedBy: string;
  when: string;
}
