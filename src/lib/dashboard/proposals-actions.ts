"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { sendAlertEmail, sendCommentNotification } from "@/lib/dashboard/notify-email";
import { sendPushToAdmins } from "@/lib/dashboard/notify-push";
import {
  describeInstagramMusicUrl,
  normalizeInstagramMusicUrl,
} from "@/lib/dashboard/instagram-music";
import {
  CAPTION_OPTIONS_LIMIT,
  computeProposalStatus,
  deriveTitle,
  MUSIC_OPTIONS_LIMIT,
  PROPOSAL_VERSION_LIMIT,
} from "@/lib/dashboard/proposals";
import { getAdminEmail, getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import type {
  Proposal,
  ProposalCaptionOption,
  ProposalComment,
  ProposalFormat,
  ProposalMusicOption,
  ProposalStatus,
  ProposalVersionEntry,
} from "@/types/dashboard";

const FORMATS: ProposalFormat[] = ["Carrusel", "Reel", "Historia", "Post simple"];
const STATUSES: ProposalStatus[] = ["Aprobado", "Cambios solicitados", "En revisión"];

// Cualquier usuario con sesión puede leer/comentar propuestas — misma
// apertura que tenía la versión en localStorage (el gate real es a nivel de
// ruta, en src/proxy.ts; acá solo repetimos el chequeo por consistencia con
// el resto de las server actions del proyecto, ver src/app/usuarios/actions.ts).
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

// Crear/editar/borrar contenido (no comentar) queda para Admin y Editor —
// un Comentarista puede ver todo y dejar comentarios, pero no tocar el
// contenido en sí. Mismo patrón que requireAdmin() en usuarios/actions.ts.
async function requireEditor() {
  const session = await auth();
  if (session?.user.role !== "ADMIN" && session?.user.role !== "EDITOR") {
    throw new Error("Solo un Administrador o Editor puede hacer esto.");
  }
  return session;
}

// Las alternativas de caption y las músicas se leen SIEMPRE junto con la
// propuesta (van en el mismo panel) — un include compartido evita que alguna
// de las tres consultas se olvide de una relación y devuelva un Proposal a
// medias al cliente.
const PROPOSAL_INCLUDE = {
  comments: { orderBy: { createdAt: "asc" } },
  captionOptions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
  musicOptions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProposalInclude;

type ProposalRow = Awaited<ReturnType<typeof prisma.proposal.findMany>>[number] & {
  comments: Awaited<ReturnType<typeof prisma.proposalComment.findMany>>;
  captionOptions: Awaited<ReturnType<typeof prisma.proposalCaptionOption.findMany>>;
  musicOptions: Awaited<ReturnType<typeof prisma.proposalMusicOption.findMany>>;
};

function toCaptionOption(row: { id: string; text: string; selected: boolean }): ProposalCaptionOption {
  return { id: row.id, text: row.text, selected: row.selected };
}

function toMusicOption(row: {
  id: string;
  url: string | null;
  label: string | null;
  selected: boolean;
  audioUrl: string | null;
  audioName: string | null;
}): ProposalMusicOption {
  return {
    id: row.id,
    url: row.url ?? undefined,
    label: row.label ?? undefined,
    selected: row.selected,
    audioUrl: row.audioUrl ?? undefined,
    audioName: row.audioName ?? undefined,
  };
}

function toProposal(row: ProposalRow, now: Date): Proposal {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    network: row.network,
    format: row.format as ProposalFormat,
    status: row.status as ProposalStatus,
    title: row.title,
    caption: row.caption,
    captionOptions: row.captionOptions.map(toCaptionOption),
    musicOptions: row.musicOptions.map(toMusicOption),
    hashtags: row.hashtags,
    artN: row.artN,
    images: row.images.length ? row.images : undefined,
    departmentApprovals: row.departmentApprovals,
    video: row.video ?? undefined,
    aspect: row.aspect ?? undefined,
    dim: row.dim ?? undefined,
    contentPillar: row.contentPillar ?? undefined,
    approvalInvalidatedReason: row.approvalInvalidatedReason ?? undefined,
    comments: row.comments.map((c): ProposalComment => ({
      id: c.id,
      scope: c.scope,
      author: c.author,
      text: c.text,
      images: c.images.length ? c.images : undefined,
      when: formatCommentWhen(c.createdAt, now),
      avatarBg: c.avatarBg,
      resolved: c.resolved,
    })),
  };
}

export async function getProposals(): Promise<Proposal[]> {
  await requireSession();
  const rows = await prisma.proposal.findMany({
    orderBy: { date: "asc" },
    include: PROPOSAL_INCLUDE,
  });
  const now = new Date();
  return rows.map((row) => toProposal(row, now));
}

export interface CreateProposalInput {
  date: string;
  time: string;
  network: string;
  format: ProposalFormat;
  status: ProposalStatus;
  caption: string;
  hashtags?: string;
  artN: number;
  images?: string[];
  video?: string;
  aspect?: string;
  dim?: string;
  /** undefined/"" = sin categorizar, a propósito (ver ficha 2). */
  contentPillar?: string;
  /** Alternativas de caption además de la principal (`caption`, que siempre
   * nace elegida) — mismo límite que agregarlas después desde la vista Post
   * (ver CAPTION_OPTIONS_LIMIT). Entradas vacías se ignoran. */
  extraCaptions?: string[];
  /** Músicas a cargar junto con la propuesta — mismo shape y misma validación
   * que addMusicOption() (ver buildMusicCreateData), sin selected: ninguna
   * queda elegida al nacer, igual que agregarlas después. */
  music?: AddMusicOptionInput[];
}

/** Valida y normaliza entradas de música para crearlas junto con la
 * propuesta — misma regla que addMusicOption() (al menos un enlace o un
 * audio por entrada), pero silenciosa en vez de tirar: una entrada vacía en
 * la ventana de carga es "no se llenó este campo", no un error para el
 * usuario. */
function buildMusicCreateData(
  entries: AddMusicOptionInput[] | undefined,
): { url: string | null; label: string | null; audioUrl: string | null; audioName: string | null; order: number }[] {
  if (!entries?.length) return [];
  return entries
    .map((entry) => {
      const rawUrl = entry.url?.trim();
      let normalized: string | undefined;
      if (rawUrl) {
        try {
          normalized = normalizeInstagramMusicUrl(rawUrl);
        } catch {
          normalized = undefined;
        }
      }
      let audioUrl: string | undefined;
      if (entry.audioUrl) {
        try {
          audioUrl = assertBlobUrl(entry.audioUrl);
        } catch {
          audioUrl = undefined;
        }
      }
      if (!normalized && !audioUrl) return null;
      return {
        url: normalized ?? null,
        label: entry.label?.trim() || null,
        audioUrl: audioUrl ?? null,
        audioName: audioUrl ? entry.audioName?.trim().slice(0, 200) || null : null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, MUSIC_OPTIONS_LIMIT)
    .map((entry, order) => ({ ...entry, order }));
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  await requireEditor();
  if (!input.date || !input.time.trim() || !input.caption.trim()) {
    throw new Error("Fecha, hora y caption son obligatorios.");
  }
  const format = FORMATS.includes(input.format) ? input.format : FORMATS[0];
  const status = STATUSES.includes(input.status) ? input.status : STATUSES[0];

  // Validado contra la lista vigente (no texto libre) — igual criterio que
  // format/status arriba, no un valor de cualquier otro request viejo.
  const brand = resolveBrand(await getSiteSettings());
  const contentPillar = input.contentPillar && brand.contentPillars.includes(input.contentPillar)
    ? input.contentPillar
    : null;

  const extraCaptions = (input.extraCaptions ?? [])
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, CAPTION_OPTIONS_LIMIT - 1);

  const row = await prisma.proposal.create({
    data: {
      date: input.date,
      time: input.time.trim(),
      network: input.network,
      format,
      status,
      title: deriveTitle(input.caption),
      caption: input.caption.trim(),
      hashtags: input.hashtags ?? "",
      artN: input.artN,
      images: input.images ?? [],
      video: input.video,
      aspect: input.aspect,
      dim: input.dim,
      contentPillar,
      // La propuesta nace con la alternativa principal ya elegida — así el
      // panel nunca ve una propuesta sin opciones y `caption` y su
      // alternativa arrancan sincronizados. Las de `extraCaptions` (cargadas
      // desde la misma ventana) nacen sin elegir, igual que agregarlas
      // después desde la vista Post (ver addCaptionOption).
      captionOptions: {
        create: [
          { text: input.caption.trim(), selected: true, order: 0 },
          ...extraCaptions.map((text, i) => ({ text, selected: false, order: i + 1 })),
        ],
      },
      musicOptions: { create: buildMusicCreateData(input.music) },
    },
    include: PROPOSAL_INCLUDE,
  });

  revalidatePath("/");
  revalidatePath("/calendario");
  return toProposal(row, new Date());
}

export interface UpdateProposalInput {
  date?: string;
  caption?: string;
  images?: string[];
  video?: string | null;
  artN?: number;
  departmentApprovals?: boolean[];
}

/** Campos que, si cambian en una propuesta ya aprobada, invalidan esa
 * aprobación (ficha 1) — deliberadamente sin excepciones por tipo de campo,
 * ver el caso borde de la ficha: mejor pedir de más que dejar pasar una
 * publicación distinta a la aprobada. */
const CONTENT_FIELDS = ["date", "caption", "images", "video"] as const;

/** Nombre legible de quien edita, para ProposalVersion.editedBy y para el
 * texto de "aprobación invalidada". */
function editorName(session: { user: { name?: string | null; email?: string | null } }): string {
  return session.user.name || session.user.email || "Desconocido";
}

/** Aviso al Admin de que alguien eligió una alternativa (caption o música).
 *
 * No se manda cuando el que elige es Admin: el destinatario es él mismo
 * (getAdminEmail), y avisarle de su propio click es ruido — el aviso existe
 * para enterarse de lo que hace Jun, que es Comentarista.
 *
 * El cuerpo va de una sola línea a propósito: sendAlertEmail lo mete escapado
 * dentro de un único <p>, así que un \n no se vería. */
async function notifyChoice(
  session: { user: { role: string; name?: string | null; email?: string | null } },
  title: string,
  body: string,
): Promise<void> {
  if (session.user.role === "ADMIN") return;
  const to = await getAdminEmail();
  await Promise.all([
    to ? sendAlertEmail({ to, title, body }) : Promise.resolve(),
    sendPushToAdmins({ title, body }),
  ]);
}

/** Texto de una línea para el cuerpo del mail — un caption largo entero
 * convierte el aviso en un muro. */
function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Nombre legible de la propuesta para los avisos. */
async function proposalLabel(proposalId: string): Promise<string> {
  const row = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { title: true },
  });
  return row?.title ? `"${row.title}"` : "Un post";
}

/** Guarda el estado anterior del caption/media antes de pisarlo (ficha 5) y
 * poda a las últimas PROPOSAL_VERSION_LIMIT versiones de esa propuesta. */
async function snapshotVersion(
  proposalId: string,
  previous: { caption: string; images: string[]; video: string | null },
  editedBy: string,
): Promise<void> {
  await prisma.proposalVersion.create({
    data: {
      proposalId,
      caption: previous.caption,
      images: previous.images,
      video: previous.video,
      editedBy,
    },
  });
  const overflow = await prisma.proposalVersion.findMany({
    where: { proposalId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: PROPOSAL_VERSION_LIMIT,
  });
  if (overflow.length) {
    await prisma.proposalVersion.deleteMany({ where: { id: { in: overflow.map((v) => v.id) } } });
  }
}

export interface UpdateProposalResult {
  /** Solo viene seteado cuando el server pisó lo que pedía el patch (una
   * edición invalidó la aprobación, o se volvió a aprobar) — el caller lo
   * usa para reconciliar el estado optimista del cliente con lo real. */
  departmentApprovals?: boolean[];
  approvalInvalidatedReason?: string | null;
}

export async function updateProposal(id: string, patch: UpdateProposalInput): Promise<UpdateProposalResult> {
  // Aprobar (el checkbox de "Jun") no es "editar contenido" — Jun es
  // Comentarista y es quien de verdad aprueba, así que un patch que solo
  // toca departmentApprovals alcanza con sesión. Si además toca algún campo
  // de contenido (fecha/caption/media/artN), sigue restringido a Editor/Admin.
  const patchKeys = Object.keys(patch);
  const isApprovalOnly = patchKeys.length > 0 && patchKeys.every((key) => key === "departmentApprovals");
  const session = isApprovalOnly ? await requireSession() : await requireEditor();

  const current = await prisma.proposal.findUnique({
    where: { id },
    select: {
      title: true,
      caption: true,
      images: true,
      video: true,
      departmentApprovals: true,
    },
  });
  if (!current) throw new Error("Propuesta no encontrada.");

  const wasApproved = current.departmentApprovals?.[0] ?? false;
  const contentTouched = CONTENT_FIELDS.some((key) => key in patch);

  // Si se está tocando la aprobación, decidir si es un nuevo "aprobado" (para
  // notificar y limpiar el aviso de invalidación) — solo en la transición
  // false→true, no en cada click ni al desmarcar.
  let justApproved = false;
  let nextApprovals = patch.departmentApprovals;
  // undefined = no toca este campo; null = lo limpia; string = lo setea.
  let invalidatedReason: string | null | undefined;

  if (patch.departmentApprovals !== undefined) {
    const wantsApproved = patch.departmentApprovals[0] === true;
    justApproved = !wasApproved && wantsApproved;
    if (justApproved) invalidatedReason = null;
  } else if (contentTouched && wasApproved) {
    nextApprovals = [false];
    const who = session.user.name || session.user.email || "un usuario";
    const when = new Date().toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
    invalidatedReason = `Aprobación invalidada: el contenido fue editado el ${when} por ${who}.`;
  }

  // Snapshot de la versión anterior antes de sobreescribir (ficha 5) — solo
  // si de verdad hay algo de contenido para guardar (evita versiones vacías
  // en la creación... acá siempre hay `current`, así que aplica siempre que
  // se toque contenido).
  if (contentTouched) {
    await snapshotVersion(id, current, editorName(session));
  }

  await prisma.proposal.update({
    where: { id },
    data: {
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.images !== undefined ? { images: patch.images } : {}),
      ...(patch.video !== undefined ? { video: patch.video } : {}),
      ...(patch.artN !== undefined ? { artN: patch.artN } : {}),
      ...(nextApprovals !== undefined ? { departmentApprovals: nextApprovals } : {}),
      ...(invalidatedReason !== undefined ? { approvalInvalidatedReason: invalidatedReason } : {}),
      // Una invalidación (nextApprovals cambió a [false]) o una nueva
      // aprobación cambia si hace falta seguir recordando — rearmar el
      // cron de la ficha 3 para que vuelva a evaluarlo, no para que
      // reavise por algo que no cambió (un edit que no toca la aprobación
      // no debe resetear esto).
      ...(nextApprovals !== undefined || justApproved ? { approvalReminderSent: false } : {}),
    },
  });

  if (justApproved) {
    const title = "Jun aprobó un post";
    const body = current.title ? `"${current.title}" quedó aprobado.` : "Un post quedó aprobado.";
    const to = await getAdminEmail();
    await Promise.all([
      to ? sendAlertEmail({ to, title, body }) : Promise.resolve(),
      sendPushToAdmins({ title, body }),
    ]);
  }

  revalidatePath("/");
  revalidatePath("/calendario");

  return { departmentApprovals: nextApprovals, approvalInvalidatedReason: invalidatedReason };
}

export async function getProposalVersions(proposalId: string): Promise<ProposalVersionEntry[]> {
  await requireSession();
  const rows = await prisma.proposalVersion.findMany({
    where: { proposalId },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    caption: row.caption,
    images: row.images.length ? row.images : undefined,
    video: row.video ?? undefined,
    editedBy: row.editedBy,
    when: formatCommentWhen(row.createdAt, now),
  }));
}

export async function deleteProposal(id: string): Promise<void> {
  await requireEditor();
  await prisma.proposal.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/calendario");
}

export interface AddCommentInput {
  author: string;
  text: string;
  avatarBg: string;
  scope?: string;
  images?: string[];
}

export async function addComment(proposalId: string, input: AddCommentInput): Promise<ProposalComment> {
  await requireSession();
  const author = input.author.trim();
  const text = input.text.trim();
  if (!author || !text) throw new Error("Nombre y comentario son obligatorios.");

  const row = await prisma.proposalComment.create({
    data: {
      proposalId,
      scope: input.scope ?? "general",
      author,
      text,
      images: input.images ?? [],
      avatarBg: input.avatarBg,
    },
  });

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { title: true, date: true },
  });
  if (proposal) {
    const brand = resolveBrand(await getSiteSettings());
    // El destino real es el mail de notificación del Admin (panel de
    // Usuarios), no un valor de config duplicado — brand.commentNotifyTo
    // (SiteSettings) manda si un Admin lo seteó a mano; si no, cae a
    // getAdminEmail().
    const notifyTo = brand.commentNotifyTo || (await getAdminEmail());
    await Promise.all([
      notifyTo &&
        sendCommentNotification({
          proposalTitle: proposal.title,
          proposalDate: proposal.date,
          author: row.author,
          text: row.text,
          to: notifyTo,
          cc: brand.commentNotifyCc,
          senderEmail: brand.senderEmail || notifyTo,
        }),
      sendPushToAdmins({
        title: `Nuevo comentario en "${proposal.title}"`,
        body: `${row.author}: ${row.text}`,
      }),
    ]);
  }

  revalidatePath("/");
  revalidatePath("/calendario");
  return {
    id: row.id,
    scope: row.scope,
    author: row.author,
    text: row.text,
    images: row.images.length ? row.images : undefined,
    when: formatCommentWhen(row.createdAt, new Date()),
    avatarBg: row.avatarBg,
    resolved: row.resolved,
  };
}

export async function toggleCommentResolved(commentId: string): Promise<boolean> {
  await requireSession();
  const current = await prisma.proposalComment.findUniqueOrThrow({ where: { id: commentId } });

  // Estado ANTES del toggle — necesario para saber si esta acción puntual es
  // la que hace que el status derivado (computeProposalStatus) pase de
  // "Cambios solicitados" a "Aprobado" (ficha de notificaciones): a
  // diferencia de la aprobación por checkbox (ver justApproved en
  // updateProposal), acá lo que cambia es un comentario, no la aprobación.
  const proposalRow = await prisma.proposal.findUnique({
    where: { id: current.proposalId },
    include: PROPOSAL_INCLUDE,
  });
  const before = proposalRow ? toProposal(proposalRow, new Date()) : null;
  const statusBefore = before ? computeProposalStatus(before) : null;

  const updated = await prisma.proposalComment.update({
    where: { id: commentId },
    data: { resolved: !current.resolved },
  });

  if (before && statusBefore === "Cambios solicitados") {
    const after: Proposal = {
      ...before,
      comments: before.comments.map((c) => (c.id === commentId ? { ...c, resolved: updated.resolved } : c)),
    };
    if (computeProposalStatus(after) === "Aprobado") {
      const title = "Post aprobado";
      const body = before.title
        ? `"${before.title}" quedó aprobado — se resolvieron los cambios solicitados.`
        : "Un post quedó aprobado al resolverse los cambios solicitados.";
      const to = await getAdminEmail();
      await Promise.all([
        to ? sendAlertEmail({ to, title, body }) : Promise.resolve(),
        sendPushToAdmins({ title, body }),
      ]);
    }
  }

  revalidatePath("/");
  revalidatePath("/calendario");
  return updated.resolved;
}

// ─── Alternativas de caption y músicas ──────────────────────────────────────
//
// El Editor/Admin carga varias alternativas de caption y Jun (Comentarista)
// elige UNA. La elegida es la que vive en Proposal.caption, que sigue siendo
// el caption "real" para el título, las versiones, el preview, el export y
// las notificaciones — por eso cada cambio de la elegida pasa por
// commitCaptionMirror(), que además arrastra el snapshot de versión y la
// invalidación de la aprobación que ya tenía updateProposal().

export interface CaptionOptionsResult extends UpdateProposalResult {
  captionOptions: ProposalCaptionOption[];
  /** Caption vigente después de la operación — el espejo de la elegida. */
  caption: string;
}

async function listCaptionOptions(proposalId: string): Promise<ProposalCaptionOption[]> {
  const rows = await prisma.proposalCaptionOption.findMany({
    where: { proposalId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toCaptionOption);
}

async function captionResult(
  proposalId: string,
  extra: UpdateProposalResult = {},
): Promise<CaptionOptionsResult> {
  const [captionOptions, row] = await Promise.all([
    listCaptionOptions(proposalId),
    prisma.proposal.findUniqueOrThrow({ where: { id: proposalId }, select: { caption: true } }),
  ]);
  revalidatePath("/");
  revalidatePath("/calendario");
  return { ...extra, captionOptions, caption: row.caption };
}

/** Sincroniza Proposal.caption con el texto de la alternativa elegida.
 * Cambiar el caption vigente de una propuesta YA aprobada invalida esa
 * aprobación, igual que editarlo directamente (ver CONTENT_FIELDS): lo que se
 * va a publicar dejó de ser lo que Jun aprobó. Si todavía no estaba aprobada
 * —el caso normal mientras Jun compara alternativas— no pasa nada. */
async function commitCaptionMirror(
  proposalId: string,
  nextCaption: string,
  editedBy: string,
): Promise<UpdateProposalResult> {
  const current = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { caption: true, images: true, video: true, departmentApprovals: true },
  });
  if (!current) throw new Error("Propuesta no encontrada.");
  if (current.caption === nextCaption) return {};

  await snapshotVersion(proposalId, current, editedBy);

  const wasApproved = current.departmentApprovals?.[0] ?? false;
  if (!wasApproved) {
    await prisma.proposal.update({ where: { id: proposalId }, data: { caption: nextCaption } });
    return {};
  }

  const when = new Date().toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
  const invalidatedReason = `Aprobación invalidada: el contenido fue editado el ${when} por ${editedBy}.`;
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      caption: nextCaption,
      departmentApprovals: [false],
      approvalInvalidatedReason: invalidatedReason,
      approvalReminderSent: false,
    },
  });
  return { departmentApprovals: [false], approvalInvalidatedReason: invalidatedReason };
}

export async function addCaptionOption(proposalId: string, text: string): Promise<CaptionOptionsResult> {
  const session = await requireEditor();
  const value = text.trim();
  if (!value) throw new Error("Escribí el texto de la alternativa.");

  const existing = await prisma.proposalCaptionOption.count({ where: { proposalId } });
  if (existing >= CAPTION_OPTIONS_LIMIT) {
    throw new Error(`No se pueden cargar más de ${CAPTION_OPTIONS_LIMIT} alternativas.`);
  }

  // `existing === 0` no debería pasar (toda propuesta nace con una), pero si
  // pasara la primera que se cargue tiene que quedar elegida — si no, la
  // propuesta se quedaría sin caption vigente.
  await prisma.proposalCaptionOption.create({
    data: { proposalId, text: value, selected: existing === 0, order: existing },
  });

  const extra = existing === 0
    ? await commitCaptionMirror(proposalId, value, editorName(session))
    : {};
  return captionResult(proposalId, extra);
}

export async function updateCaptionOption(optionId: string, text: string): Promise<CaptionOptionsResult> {
  const session = await requireEditor();
  const value = text.trim();
  if (!value) throw new Error("El caption no puede quedar vacío.");

  const option = await prisma.proposalCaptionOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa alternativa ya no existe.");

  await prisma.proposalCaptionOption.update({ where: { id: optionId }, data: { text: value } });

  const extra = option.selected
    ? await commitCaptionMirror(option.proposalId, value, editorName(session))
    : {};
  return captionResult(option.proposalId, extra);
}

export async function deleteCaptionOption(optionId: string): Promise<CaptionOptionsResult> {
  const session = await requireEditor();
  const option = await prisma.proposalCaptionOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa alternativa ya no existe.");

  const siblings = await prisma.proposalCaptionOption.findMany({
    where: { proposalId: option.proposalId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  if (siblings.length <= 1) throw new Error("Tiene que quedar al menos una alternativa de caption.");

  await prisma.proposalCaptionOption.delete({ where: { id: optionId } });

  // Si se borró la elegida, la propuesta se quedaría sin caption vigente:
  // pasa a la primera que sobrevive (y eso, como cualquier cambio del caption
  // vigente, invalida una aprobación previa).
  let extra: UpdateProposalResult = {};
  if (option.selected) {
    const fallback = siblings.find((s) => s.id !== optionId);
    if (fallback) {
      await prisma.proposalCaptionOption.update({ where: { id: fallback.id }, data: { selected: true } });
      extra = await commitCaptionMirror(option.proposalId, fallback.text, editorName(session));
    }
  }
  return captionResult(option.proposalId, extra);
}

/** Elegir alternativa NO es "editar contenido" — es justamente lo que hace
 * Jun, que es Comentarista, así que alcanza con sesión (mismo criterio que el
 * checkbox de aprobación en updateProposal). */
export async function selectCaptionOption(optionId: string): Promise<CaptionOptionsResult> {
  const session = await requireSession();
  const option = await prisma.proposalCaptionOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa alternativa ya no existe.");
  if (option.selected) return captionResult(option.proposalId);

  // Selección única: primero se apaga la anterior y recién después se prende
  // esta, en la misma transacción, para que nunca queden dos elegidas.
  await prisma.$transaction([
    prisma.proposalCaptionOption.updateMany({
      where: { proposalId: option.proposalId, selected: true },
      data: { selected: false },
    }),
    prisma.proposalCaptionOption.update({ where: { id: optionId }, data: { selected: true } }),
  ]);

  const extra = await commitCaptionMirror(option.proposalId, option.text, editorName(session));
  const result = await captionResult(option.proposalId, extra);

  const position = result.captionOptions.findIndex((o) => o.id === optionId);
  const label = await proposalLabel(option.proposalId);
  await notifyChoice(
    session,
    `${editorName(session)} eligió un caption`,
    `${label}${position >= 0 ? ` — alternativa ${position + 1} de ${result.captionOptions.length}` : ""}: ` +
      excerpt(option.text) +
      // Si la propuesta ya estaba aprobada, elegir otra alternativa la
      // desaprueba (ver commitCaptionMirror) — eso es lo que hay que hacer,
      // y el Admin necesita enterarse en el mismo aviso.
      (extra.approvalInvalidatedReason ? " — Esto invalidó la aprobación anterior." : ""),
  );
  return result;
}

async function listMusicOptions(proposalId: string): Promise<ProposalMusicOption[]> {
  const rows = await prisma.proposalMusicOption.findMany({
    where: { proposalId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  revalidatePath("/");
  revalidatePath("/calendario");
  return rows.map(toMusicOption);
}

export interface AddMusicOptionInput {
  /** Enlace de instagram.com — opcional: una música puede cargarse solo con
   * el archivo de audio, sin pasar por Instagram para nada. */
  url?: string;
  label?: string;
  /** URL de Blob ya subida (ver uploadBlob() en el cliente) — opcional por la
   * misma razón inversa: una música puede quedar solo como enlace, sin
   * audio, y agregarlo después con setMusicOptionAudio(). */
  audioUrl?: string;
  audioName?: string;
}

export async function addMusicOption(
  proposalId: string,
  input: AddMusicOptionInput,
): Promise<ProposalMusicOption[]> {
  await requireEditor();
  const rawUrl = input.url?.trim();
  // Tira si no es un enlace de instagram.com (el cliente valida con la misma
  // función antes de llamar, así el mensaje llega tal cual; esta es la que
  // manda).
  const normalized = rawUrl ? normalizeInstagramMusicUrl(rawUrl) : undefined;
  const audioUrl = input.audioUrl ? assertBlobUrl(input.audioUrl, "No se pudo subir el audio.") : undefined;
  if (!normalized && !audioUrl) {
    throw new Error("Hace falta un enlace de Instagram o un archivo de audio.");
  }

  const existing = await prisma.proposalMusicOption.findMany({
    where: { proposalId },
    select: { id: true, url: true },
  });
  if (existing.length >= MUSIC_OPTIONS_LIMIT) {
    throw new Error(`No se pueden cargar más de ${MUSIC_OPTIONS_LIMIT} músicas.`);
  }
  if (normalized && existing.some((m) => m.url === normalized)) {
    throw new Error("Esa música ya está en la lista.");
  }

  await prisma.proposalMusicOption.create({
    data: {
      proposalId,
      url: normalized,
      label: input.label?.trim() || null,
      audioUrl,
      audioName: audioUrl ? input.audioName?.trim().slice(0, 200) || null : null,
      order: existing.length,
    },
  });
  return listMusicOptions(proposalId);
}

export async function deleteMusicOption(optionId: string): Promise<ProposalMusicOption[]> {
  await requireEditor();
  const option = await prisma.proposalMusicOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa música ya no existe.");
  await prisma.proposalMusicOption.delete({ where: { id: optionId } });
  return listMusicOptions(option.proposalId);
}

/** Selección única igual que el caption, pero acá "ninguna" es un estado
 * válido: un post puede no llevar música, así que la casilla se puede
 * desmarcar. No toca la aprobación — la música no es parte de lo que
 * computeProposalStatus considera contenido publicable. */
export async function setMusicOptionSelected(
  optionId: string,
  selected: boolean,
): Promise<ProposalMusicOption[]> {
  const session = await requireSession();
  const option = await prisma.proposalMusicOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa música ya no existe.");

  // Desmarcar no avisa: la propuesta se queda sin música elegida, que es un
  // estado válido (un post puede no llevar ninguna) y no una decisión que el
  // Admin necesite recibir por mail.
  if (!selected) {
    await prisma.proposalMusicOption.update({ where: { id: optionId }, data: { selected: false } });
    return listMusicOptions(option.proposalId);
  }

  await prisma.$transaction([
    prisma.proposalMusicOption.updateMany({
      where: { proposalId: option.proposalId, selected: true },
      data: { selected: false },
    }),
    prisma.proposalMusicOption.update({ where: { id: optionId }, data: { selected: true } }),
  ]);
  const result = await listMusicOptions(option.proposalId);

  const label = await proposalLabel(option.proposalId);
  const musicName = option.label || (option.url ? describeInstagramMusicUrl(option.url) : "Audio subido");
  await notifyChoice(
    session,
    `${editorName(session)} eligió la música`,
    `${label}: ${musicName}${option.url ? ` — ${option.url}` : ""}`,
  );
  return result;
}

/** Adjunta (o reemplaza) el archivo de audio de una música. Cargar contenido
 * es de Editor/Admin, igual que el resto de las alternativas — elegir es lo
 * único que alcanza con sesión. */
export async function setMusicOptionAudio(
  optionId: string,
  audioUrl: string,
  audioName?: string,
): Promise<ProposalMusicOption[]> {
  await requireEditor();
  const option = await prisma.proposalMusicOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa música ya no existe.");

  await prisma.proposalMusicOption.update({
    where: { id: optionId },
    data: {
      audioUrl: assertBlobUrl(audioUrl, "No se pudo subir el audio."),
      audioName: audioName?.trim().slice(0, 200) || null,
    },
  });
  return listMusicOptions(option.proposalId);
}

/** Quita el audio y deja la música como enlace solo. El archivo queda en Blob
 * a propósito: borrarlo desde acá dejaría rota cualquier otra referencia y no
 * hay forma barata de saber si la hay. */
export async function clearMusicOptionAudio(optionId: string): Promise<ProposalMusicOption[]> {
  await requireEditor();
  const option = await prisma.proposalMusicOption.findUnique({ where: { id: optionId } });
  if (!option) throw new Error("Esa música ya no existe.");

  await prisma.proposalMusicOption.update({
    where: { id: optionId },
    data: { audioUrl: null, audioName: null },
  });
  return listMusicOptions(option.proposalId);
}
