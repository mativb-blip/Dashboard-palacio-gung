"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { sendCommentNotification } from "@/lib/dashboard/notify-email";
import { sendPushToAll } from "@/lib/dashboard/notify-push";
import { deriveTitle } from "@/lib/dashboard/proposals";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import type { Proposal, ProposalComment, ProposalFormat, ProposalStatus } from "@/types/dashboard";

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
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  await requireSession();
  if (!input.date || !input.time.trim() || !input.caption.trim()) {
    throw new Error("Fecha, hora y caption son obligatorios.");
  }
  const format = FORMATS.includes(input.format) ? input.format : FORMATS[0];
  const status = STATUSES.includes(input.status) ? input.status : STATUSES[0];

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
}

export async function updateProposal(id: string, patch: UpdateProposalInput): Promise<void> {
  await requireSession();

  // Si se está tocando la aprobación, hay que saber el valor previo para
  // notificar solo en la transición false→true (no en cada click ni al
  // desmarcar) — de ahí el select de acá antes del update.
  let justApproved = false;
  let title: string | undefined;
  if (patch.departmentApprovals !== undefined) {
    const current = await prisma.proposal.findUnique({
      where: { id },
      select: { departmentApprovals: true, title: true },
    });
    justApproved = !(current?.departmentApprovals?.[0] ?? false) && patch.departmentApprovals[0] === true;
    title = current?.title;
  }

  await prisma.proposal.update({
    where: { id },
    data: {
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.images !== undefined ? { images: patch.images } : {}),
      ...(patch.video !== undefined ? { video: patch.video } : {}),
      ...(patch.artN !== undefined ? { artN: patch.artN } : {}),
      ...(patch.departmentApprovals !== undefined ? { departmentApprovals: patch.departmentApprovals } : {}),
    },
  });

  if (justApproved) {
    await sendPushToAll({
      title: "Jun aprobó un post",
      body: title ? `"${title}" quedó aprobado.` : "Un post quedó aprobado.",
    });
  }

  revalidatePath("/");
  revalidatePath("/calendario");
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
