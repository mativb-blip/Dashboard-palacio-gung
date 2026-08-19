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

/** Alternativa de caption — el Editor carga varias y Jun elige una sola.
 * La elegida (`selected`) es la que se refleja en `Proposal.caption`. */
export interface ProposalCaptionOption {
  id: string;
  text: string;
  selected: boolean;
}

/** Música de Instagram propuesta — misma selección única que el caption,
 * pero acá "ninguna elegida" es un estado válido. */
export interface ProposalMusicOption {
  id: string;
  url: string;
  /** Nombre que le puso quien la cargó; vacío = la UI lo deriva de la URL. */
  label?: string;
  selected: boolean;
  /** Audio subido para poder escucharla en el panel — Instagram no deja
   * reproducir lo suyo afuera, así que este es el único reproductor real.
   * undefined = solo enlace. */
  audioUrl?: string;
  audioName?: string;
}

export interface Proposal {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time: string;
  network: string;
  format: ProposalFormat;
  status: ProposalStatus;
  title: string;
  /** Caption vigente = el texto de la alternativa elegida en `captionOptions`. */
  caption: string;
  /** Alternativas de caption, en orden de carga. Siempre trae al menos una. */
  captionOptions?: ProposalCaptionOption[];
  /** Músicas propuestas; vacío/undefined = el post no lleva música. */
  musicOptions?: ProposalMusicOption[];
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
