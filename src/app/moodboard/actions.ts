"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deriveTitle } from "@/lib/dashboard/proposals";
import { sanitizeRichText, TEXT_ALIGNS, type TextAlign } from "@/lib/dashboard/rich-text";
import {
  DEFAULT_ELEMENT_SIZE,
  isTextElement,
  MIN_ELEMENT_SIZE,
  type MoodboardElement,
  type MoodboardElementPatch,
  type MoodboardElementType,
  type MoodboardSessionDetail,
  type MoodboardSessionSummary,
} from "@/types/moodboard";

const ELEMENT_TYPES: MoodboardElementType[] = [
  "image",
  "video",
  "video-embed",
  "text-note",
  "text-panel",
];

/** El Moodboard es material de trabajo del Admin, no del cliente — a
 * diferencia de las propuestas (que cualquier sesión puede leer y comentar),
 * acá el gate es ADMIN en cada action, igual que en usuarios/actions.ts. La
 * sección tampoco se muestra en el Topbar a otros roles, pero el chequeo real
 * vive acá: ocultar un botón no es un permiso. */
async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Solo un Administrador puede usar el Moodboard.");
  }
  return session;
}

/** Además del rol, cada sesión pertenece a quien la creó: un segundo Admin no
 * ve ni toca los tableros del primero. Todas las lecturas/escrituras de
 * elementos pasan por acá para no confiar en un sessionId venido del cliente. */
async function requireOwnedSession(sessionId: string) {
  const auth = await requireAdmin();
  const row = await prisma.moodboardSession.findUnique({
    where: { id: sessionId },
    select: { id: true, ownerId: true },
  });
  if (!row || row.ownerId !== auth.user.id) throw new Error("Sesión de moodboard no encontrada.");
  return row;
}

async function requireOwnedElement(elementId: string) {
  const authSession = await requireAdmin();
  const row = await prisma.moodboardElement.findUnique({
    where: { id: elementId },
    include: { session: { select: { ownerId: true } } },
  });
  if (!row || row.session.ownerId !== authSession.user.id) throw new Error("Elemento no encontrado.");
  return row;
}

type ElementRow = Awaited<ReturnType<typeof prisma.moodboardElement.findMany>>[number];

function toElement(row: ElementRow): MoodboardElement {
  return {
    id: row.id,
    type: row.type as MoodboardElementType,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    rotation: row.rotation,
    url: row.url ?? undefined,
    filename: row.filename ?? undefined,
    embedUrl: row.embedUrl ?? undefined,
    // Se vuelve a sanear al leer, no solo al escribir: una fila vieja (o
    // tocada fuera de la app) no debe poder inyectar marcado en el canvas.
    text: row.text ? sanitizeRichText(row.text) : undefined,
    color: row.color ?? undefined,
    notes: row.notes ?? undefined,
    fontSize: row.fontSize ?? undefined,
    textAlign: (row.textAlign as TextAlign | null) ?? undefined,
    textColor: row.textColor ?? undefined,
  };
}

// ── Sesiones ──────────────────────────────────────────────────────────────

export async function listSessions(): Promise<MoodboardSessionSummary[]> {
  const session = await requireAdmin();
  const rows = await prisma.moodboardSession.findMany({
    where: { ownerId: session.user.id },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { elements: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    archived: row.archivedAt !== null,
    elementCount: row._count.elements,
  }));
}

export async function getSession(sessionId: string): Promise<MoodboardSessionDetail | null> {
  const authSession = await requireAdmin();
  const row = await prisma.moodboardSession.findFirst({
    where: { id: sessionId, ownerId: authSession.user.id },
    include: {
      elements: { orderBy: { zIndex: "asc" } },
      _count: { select: { elements: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    archived: row.archivedAt !== null,
    elementCount: row._count.elements,
    elements: row.elements.map(toElement),
  };
}

export async function createSession(name: string): Promise<MoodboardSessionSummary> {
  const session = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("La sesión necesita un nombre.");

  const row = await prisma.moodboardSession.create({
    data: { name: trimmed, ownerId: session.user.id },
  });
  revalidatePath("/moodboard");
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    archived: false,
    elementCount: 0,
  };
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  await requireOwnedSession(sessionId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("La sesión necesita un nombre.");
  await prisma.moodboardSession.update({ where: { id: sessionId }, data: { name: trimmed } });
  revalidatePath("/moodboard");
}

/** Archivar es un toggle, no un borrado — ver el comentario del modelo. */
export async function setSessionArchived(sessionId: string, archived: boolean): Promise<void> {
  await requireOwnedSession(sessionId);
  await prisma.moodboardSession.update({
    where: { id: sessionId },
    data: { archivedAt: archived ? new Date() : null },
  });
  revalidatePath("/moodboard");
}

export async function deleteSession(sessionId: string): Promise<void> {
  await requireOwnedSession(sessionId);
  // Los elementos se van con la sesión (onDelete: Cascade). Los archivos en
  // Blob Storage quedan: son baratos y borrarlos acá haría irreversible un
  // "borré la sesión equivocada".
  await prisma.moodboardSession.delete({ where: { id: sessionId } });
  revalidatePath("/moodboard");
}

// ── Elementos ─────────────────────────────────────────────────────────────

export interface CreateElementInput {
  type: MoodboardElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  url?: string;
  filename?: string;
  embedUrl?: string;
  text?: string;
}

export async function createElement(
  sessionId: string,
  input: CreateElementInput,
): Promise<MoodboardElement> {
  await requireOwnedSession(sessionId);
  const type = ELEMENT_TYPES.includes(input.type) ? input.type : "image";
  if (!isTextElement(type) && !input.url && !input.embedUrl) {
    throw new Error("El elemento necesita un archivo o un link.");
  }

  // Cada elemento nuevo va arriba de todo — es lo que acaba de traer el
  // usuario, no tiene sentido que aparezca tapado por algo viejo.
  const top = await prisma.moodboardElement.aggregate({
    where: { sessionId },
    _max: { zIndex: true },
  });

  const row = await prisma.moodboardElement.create({
    data: {
      sessionId,
      type,
      x: input.x,
      y: input.y,
      width: Math.max(MIN_ELEMENT_SIZE, input.width ?? DEFAULT_ELEMENT_SIZE.width),
      height: Math.max(MIN_ELEMENT_SIZE, input.height ?? DEFAULT_ELEMENT_SIZE.height),
      zIndex: (top._max.zIndex ?? 0) + 1,
      url: input.url,
      filename: input.filename,
      embedUrl: input.embedUrl,
      text: input.text ? sanitizeRichText(input.text) : undefined,
    },
  });
  return toElement(row);
}

/** Un solo round-trip para todo lo que cambió desde el último guardado — el
 * canvas junta los movimientos con debounce en vez de mandar un update por
 * cada pixel (ver flushPending en MoodboardCanvas). */
export async function updateElements(
  sessionId: string,
  patches: Record<string, MoodboardElementPatch>,
): Promise<void> {
  await requireOwnedSession(sessionId);
  const entries = Object.entries(patches);
  if (!entries.length) return;

  await prisma.$transaction(
    entries.map(([id, patch]) =>
      prisma.moodboardElement.updateMany({
        // updateMany + sessionId en el where: un id de otra sesión no
        // actualiza nada en vez de tirar (y sin un findUnique extra por id).
        where: { id, sessionId },
        data: {
          ...(patch.x !== undefined ? { x: patch.x } : {}),
          ...(patch.y !== undefined ? { y: patch.y } : {}),
          ...(patch.width !== undefined ? { width: Math.max(MIN_ELEMENT_SIZE, patch.width) } : {}),
          ...(patch.height !== undefined ? { height: Math.max(MIN_ELEMENT_SIZE, patch.height) } : {}),
          ...(patch.zIndex !== undefined ? { zIndex: patch.zIndex } : {}),
          ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
          // El cliente ya sanea antes de mandar, pero esta action se puede
          // llamar directo: la frontera de confianza es acá.
          ...(patch.text !== undefined ? { text: sanitizeRichText(patch.text) } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.fontSize !== undefined
            ? { fontSize: Math.min(96, Math.max(9, Math.round(patch.fontSize))) }
            : {}),
          ...(patch.textAlign !== undefined && TEXT_ALIGNS.includes(patch.textAlign)
            ? { textAlign: patch.textAlign }
            : {}),
          ...(patch.textColor !== undefined ? { textColor: patch.textColor } : {}),
        },
      }),
    ),
  );
}

export async function deleteElement(elementId: string): Promise<void> {
  await requireOwnedElement(elementId);
  await prisma.moodboardElement.delete({ where: { id: elementId } });
}

export async function duplicateElement(elementId: string): Promise<MoodboardElement> {
  const source = await requireOwnedElement(elementId);
  const top = await prisma.moodboardElement.aggregate({
    where: { sessionId: source.sessionId },
    _max: { zIndex: true },
  });
  const row = await prisma.moodboardElement.create({
    data: {
      sessionId: source.sessionId,
      type: source.type,
      // Desplazada para que se vea que hay dos y se pueda agarrar la de abajo.
      x: source.x + 24,
      y: source.y + 24,
      width: source.width,
      height: source.height,
      zIndex: (top._max.zIndex ?? 0) + 1,
      rotation: source.rotation,
      url: source.url,
      filename: source.filename,
      embedUrl: source.embedUrl,
      text: source.text,
      color: source.color,
      notes: source.notes,
      fontSize: source.fontSize,
      textAlign: source.textAlign,
      textColor: source.textColor,
    },
  });
  return toElement(row);
}

// ── Puente al flujo de propuestas ─────────────────────────────────────────

export interface ProposalFromElementInput {
  caption: string;
  date: string;
  time: string;
  network: string;
  format: string;
}

/** "Usar como base para una propuesta": crea una Propuesta normal con el
 * archivo del elemento ya cargado. El elemento NO se borra — la referencia
 * sigue sirviendo en el tablero aunque ya se haya bajado a una propuesta. */
export async function createProposalFromElement(
  elementId: string,
  input: ProposalFromElementInput,
): Promise<string> {
  const element = await requireOwnedElement(elementId);
  if (!element.url) {
    throw new Error("Este elemento no tiene un archivo propio — subilo primero o usá un arte.");
  }
  if (!input.date || !input.time.trim() || !input.caption.trim()) {
    throw new Error("Fecha, hora y caption son obligatorios.");
  }

  const isVideo = element.type === "video";
  const caption = input.caption.trim();

  const row = await prisma.proposal.create({
    data: {
      date: input.date,
      time: input.time.trim(),
      network: input.network,
      format: input.format,
      status: "En revisión",
      title: deriveTitle(caption),
      caption,
      hashtags: "",
      artN: 1,
      // Un Reel guarda el video aparte y deja images[] para la portada (que
      // acá todavía no hay) — ver Proposal.video en schema.prisma.
      images: isVideo ? [] : [element.url],
      video: isVideo ? element.url : undefined,
    },
  });

  revalidatePath("/");
  revalidatePath("/calendario");
  return row.id;
}
