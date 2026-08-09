"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { sendCommentNotification } from "@/lib/dashboard/notify-email";
import { sendPushToAll } from "@/lib/dashboard/notify-push";
import { deriveTitle, PROPOSAL_VERSION_LIMIT } from "@/lib/dashboard/proposals";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import type {
  Proposal,
  ProposalComment,
  ProposalFormat,
  ProposalStatus,
  ProposalVersionEntry,
} from "@/types/dashboard";

const FORMATS: ProposalFormat[] = ["Carrusel", "Reel", "Historia", "Post simple"];
const STATUSES: ProposalStatus[] = ["Aprobado", "Cambios solicitados", "En revisión"];

// Cualquier usuario con sesión puede leer/cargar/comentar propuestas — misma
// apertura que tenía la versión en localStorage (el gate real es a nivel de
// ruta, en src/proxy.ts; acá solo repetimos el chequeo por consistencia con
// el resto de las server actions del proyecto, ver src/app/usuarios/actions.ts).
async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

type ProposalRow = Awaited<ReturnType<typeof prisma.proposal.findMany>>[number] & {
  comments: Awaited<ReturnType<typeof prisma.proposalComment.findMany>>;
};

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
    hashtags: row.hashtags,
    artN: row.artN,
    images: row.images.length ? row.images : undefined,
    departmentApprovals: row.departmentApprovals,
    video: row.video ?? undefined,
    aspect: row.aspect ?? undefined,
    dim: row.dim ?? undefined,
    contentPillar: row.contentPillar ?? undefined,
    approvalInvalidatedReason: row.approvalInvalidatedReason ?? undefined,
    approvalCriteriaChecked: row.approvalCriteriaChecked,
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
    include: { comments: { orderBy: { createdAt: "asc" } } },
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
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  await requireSession();
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
    },
    include: { comments: true },
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
  contentPillar?: string | null;
  approvalCriteriaChecked?: string[];
}

/** Campos que, si cambian en una propuesta ya aprobada, invalidan esa
 * aprobación (ficha 1) — deliberadamente sin excepciones por tipo de campo,
 * ver el caso borde de la ficha: mejor pedir de más que dejar pasar una
 * publicación distinta a la aprobada. */
const CONTENT_FIELDS = ["date", "caption", "images", "video"] as const;

export interface UpdateProposalResult {
  /** Solo viene seteado cuando el server pisó lo que pedía el patch (una
   * edición invalidó la aprobación, o se volvió a aprobar) — el caller lo
   * usa para reconciliar el estado optimista del cliente con lo real. */
  departmentApprovals?: boolean[];
  approvalInvalidatedReason?: string | null;
}

export async function updateProposal(id: string, patch: UpdateProposalInput): Promise<UpdateProposalResult> {
  const session = await requireSession();

  const current = await prisma.proposal.findUnique({
    where: { id },
    select: {
      title: true,
      caption: true,
      images: true,
      video: true,
      departmentApprovals: true,
      approvalCriteriaChecked: true,
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
    if (wantsApproved) {
      const brand = resolveBrand(await getSiteSettings());
      const checked = current.approvalCriteriaChecked ?? [];
      const allCriteriaChecked = brand.approvalCriteria.every((c) => checked.includes(c));
      if (!allCriteriaChecked) {
        throw new Error("Faltan criterios del checklist por marcar antes de poder aprobar.");
      }
    }
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
    await prisma.proposalVersion.create({
      data: {
        proposalId: id,
        caption: current.caption,
        images: current.images,
        video: current.video,
        editedBy: session.user.name || session.user.email || "Desconocido",
      },
    });
    const overflow = await prisma.proposalVersion.findMany({
      where: { proposalId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      skip: PROPOSAL_VERSION_LIMIT,
    });
    if (overflow.length) {
      await prisma.proposalVersion.deleteMany({ where: { id: { in: overflow.map((v) => v.id) } } });
    }
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
      ...(patch.contentPillar !== undefined ? { contentPillar: patch.contentPillar } : {}),
      ...(patch.approvalCriteriaChecked !== undefined
        ? { approvalCriteriaChecked: patch.approvalCriteriaChecked, approvalCriteriaCheckedAt: new Date() }
        : {}),
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
    await sendPushToAll({
      title: "Jun aprobó un post",
      body: current.title ? `"${current.title}" quedó aprobado.` : "Un post quedó aprobado.",
    });
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
  await requireSession();
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
    await Promise.all([
      sendCommentNotification({
        proposalTitle: proposal.title,
        proposalDate: proposal.date,
        author: row.author,
        text: row.text,
        to: brand.commentNotifyTo,
        cc: brand.commentNotifyCc,
        senderEmail: brand.senderEmail,
      }),
      sendPushToAll({
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
  const updated = await prisma.proposalComment.update({
    where: { id: commentId },
    data: { resolved: !current.resolved },
  });
  revalidatePath("/");
  revalidatePath("/calendario");
  return updated.resolved;
}
