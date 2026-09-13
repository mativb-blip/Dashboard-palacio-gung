"use server";

// Mediciones de Instagram: cargarlas, listarlas y cruzarlas con el calendario.
//
// Lo que se guarda son las LECTURAS del panel; las métricas salen de
// deriveMetrics() en cada consulta (ver instagram-metrics.ts, y el porqué en
// el comentario de InstagramSnapshot en el schema).

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deriveMetrics, type DerivedMetrics, type SnapshotReadings } from "@/lib/dashboard/instagram-metrics";
import { parseProposalDateTime } from "@/lib/dashboard/schedule-time";

async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");
  return session;
}

/** Cargar una medición es trabajo de la agencia — es dato que se transcribe
 * del panel de Instagram, no algo que el cliente revise. Mismo criterio que
 * el resto del contenido. */
async function requireEditor() {
  const session = await auth();
  if (session?.user.role !== "ADMIN" && session?.user.role !== "EDITOR") {
    throw new Error("Solo un Administrador o Editor puede cargar una medición.");
  }
  return session;
}

export interface SnapshotInput extends SnapshotReadings {
  capturedAt?: string;
  bestDays?: string[];
  bestHourFrom?: number | null;
  bestHourTo?: number | null;
  notes?: string;
}

export interface SnapshotWithMetrics {
  id: string;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
  addedBy?: string;
  notes?: string;
  bestDays: string[];
  bestHourFrom?: number;
  bestHourTo?: number;
  readings: SnapshotReadings;
  metrics: DerivedMetrics;
  /** Las mismas métricas de la ventana anterior, para poder mostrar la
   * variación. Ausente en la primera medición — y ahí la pantalla lo dice en
   * vez de fingir un 0 %, que se leería como "no cambió". */
  previous?: {
    periodStart: string;
    periodEnd: string;
    metrics: DerivedMetrics;
    /** También las lecturas: hay tarjetas que comparan una cifra cruda
     * (visitas al perfil) y no una derivada. */
    readings: SnapshotReadings;
  };
}

/** Cuántas propuestas del período caen dentro de la franja horaria en que la
 * audiencia está más activa. Es lo único del informe que se cruza con el
 * resto del dashboard, y por eso existe esta sección. */
export interface ScheduleFit {
  total: number;
  dentro: number;
  /** La hora de CADA propuesta interpretada, sin agrupar. El reloj las pinta
   * una por una sobre la curva: agrupadas se perdería que dos caen a la misma
   * hora, que es justamente lo que se quiere ver. */
  horas: number[];
}

type SnapshotRow = Awaited<ReturnType<typeof prisma.instagramSnapshot.findMany>>[number];

function toReadings(row: SnapshotRow): SnapshotReadings {
  return {
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    views: row.views,
    viewers: row.viewers,
    interactions: row.interactions,
    follows: row.follows,
    unfollows: row.unfollows,
    followersEnd: row.followersEnd,
    viewersFollowersPct: row.viewersFollowersPct,
    interactionsFollowersPct: row.interactionsFollowersPct,
    profileVisits: row.profileVisits,
    bioLinkTaps: row.bioLinkTaps,
    addressTaps: row.addressTaps,
    viewersPosts: row.viewersPosts,
    viewersReels: row.viewersReels,
    viewersStories: row.viewersStories,
    interactionsPosts: row.interactionsPosts,
    interactionsReels: row.interactionsReels,
    interactionsStories: row.interactionsStories,
    likes: row.likes,
    shares: row.shares,
    saves: row.saves,
    comments: row.comments,
    reposts: row.reposts,
    replies: row.replies,
  };
}

/** Todas las mediciones, de la más nueva a la más vieja, cada una con sus
 * métricas y las de la ventana inmediatamente anterior. */
export async function getInstagramSnapshots(): Promise<SnapshotWithMetrics[]> {
  await requireSession();
  const rows = await prisma.instagramSnapshot.findMany({ orderBy: { periodEnd: "desc" } });

  return rows.map((row, i) => {
    // rows está en orden descendente, así que la anterior en el tiempo es la
    // SIGUIENTE del array. Es fácil equivocarse acá y comparar contra el
    // futuro.
    const anterior = rows[i + 1];
    return {
      id: row.id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      capturedAt: row.capturedAt.toISOString(),
      addedBy: row.addedBy ?? undefined,
      notes: row.notes ?? undefined,
      bestDays: row.bestDays,
      bestHourFrom: row.bestHourFrom ?? undefined,
      bestHourTo: row.bestHourTo ?? undefined,
      readings: toReadings(row),
      metrics: deriveMetrics(toReadings(row)),
      previous: anterior
        ? {
            periodStart: anterior.periodStart,
            periodEnd: anterior.periodEnd,
            metrics: deriveMetrics(toReadings(anterior)),
            readings: toReadings(anterior),
          }
        : undefined,
    };
  });
}

/**
 * Cruza la franja horaria de la medición más reciente con las propuestas del
 * plan, para responder "¿estoy publicando cuando mi gente está?".
 *
 * Mira las propuestas del período de la medición, no todas: comparar la
 * franja de agosto contra lo que se publicó en marzo no dice nada.
 */
export async function getScheduleFit(
  periodStart: string,
  periodEnd: string,
  from: number,
  to: number,
): Promise<ScheduleFit> {
  await requireSession();
  const rows = await prisma.proposal.findMany({
    where: { date: { gte: periodStart, lte: periodEnd } },
    select: { date: true, time: true },
  });

  const horas: number[] = [];
  let dentro = 0;

  for (const r of rows) {
    // `time` es texto libre ("6:30 PM"): se reusa el mismo parser que los
    // recordatorios, que ya asume UTC-4. Lo que no se entiende no se cuenta
    // ni como dentro ni como fuera — inventarle una hora sería peor.
    const cuando = parseProposalDateTime(r.date, r.time);
    if (!cuando) continue;
    // El parser devuelve un instante UTC de una hora pensada en UTC-4;
    // sumar 20 y tomar módulo 24 la devuelve a la hora local de Santo Domingo.
    const hora = (cuando.getUTCHours() + 20) % 24;
    horas.push(hora);
    if (hora >= from && hora < to) dentro++;
  }

  return { total: horas.length, dentro, horas: horas.sort((a, b) => a - b) };
}

/** Rechaza lo que no puede ser una lectura del panel. No valida "coherencia"
 * entre campos a propósito: el panel de Instagram ES incoherente consigo
 * mismo (cabecera 1.348 vs. desglose 1.087), y una validación cruzada
 * impediría cargar el dato real. Esa diferencia se muestra, no se corrige. */
function exigirEntero(valor: number, campo: string): number {
  if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(valor)) {
    throw new Error(`"${campo}" tiene que ser un número entero de 0 o más.`);
  }
  return valor;
}

function exigirPorcentaje(valor: number, campo: string): number {
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw new Error(`"${campo}" tiene que ser un porcentaje entre 0 y 100.`);
  }
  return valor;
}

export async function addInstagramSnapshot(input: SnapshotInput): Promise<SnapshotWithMetrics[]> {
  const session = await requireEditor();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) {
    throw new Error("Las fechas del período son obligatorias.");
  }
  if (input.periodEnd < input.periodStart) {
    throw new Error("El fin del período no puede ser anterior al inicio.");
  }

  const yaExiste = await prisma.instagramSnapshot.findFirst({
    where: { periodStart: input.periodStart, periodEnd: input.periodEnd },
    select: { id: true },
  });
  if (yaExiste) throw new Error("Ya hay una medición cargada para ese período.");

  const enteros = [
    "views", "viewers", "interactions", "follows", "unfollows", "followersEnd",
    "profileVisits", "bioLinkTaps", "addressTaps",
    "viewersPosts", "viewersReels", "viewersStories",
    "interactionsPosts", "interactionsReels", "interactionsStories",
  ] as const;
  for (const campo of enteros) exigirEntero(input[campo], campo);
  exigirPorcentaje(input.viewersFollowersPct, "viewersFollowersPct");
  exigirPorcentaje(input.interactionsFollowersPct, "interactionsFollowersPct");

  await prisma.instagramSnapshot.create({
    data: {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : new Date(),
      views: input.views,
      viewers: input.viewers,
      interactions: input.interactions,
      follows: input.follows,
      unfollows: input.unfollows,
      followersEnd: input.followersEnd,
      viewersFollowersPct: input.viewersFollowersPct,
      interactionsFollowersPct: input.interactionsFollowersPct,
      profileVisits: input.profileVisits,
      bioLinkTaps: input.bioLinkTaps,
      addressTaps: input.addressTaps,
      viewersPosts: input.viewersPosts,
      viewersReels: input.viewersReels,
      viewersStories: input.viewersStories,
      interactionsPosts: input.interactionsPosts,
      interactionsReels: input.interactionsReels,
      interactionsStories: input.interactionsStories,
      likes: input.likes ?? null,
      shares: input.shares ?? null,
      saves: input.saves ?? null,
      comments: input.comments ?? null,
      reposts: input.reposts ?? null,
      replies: input.replies ?? null,
      bestDays: input.bestDays ?? [],
      bestHourFrom: input.bestHourFrom ?? null,
      bestHourTo: input.bestHourTo ?? null,
      notes: input.notes?.trim().slice(0, 2000) || null,
      addedBy: session.user.name || session.user.email || null,
    },
  });

  revalidatePath("/evolucion");
  return getInstagramSnapshots();
}

export async function deleteInstagramSnapshot(id: string): Promise<SnapshotWithMetrics[]> {
  await requireEditor();
  await prisma.instagramSnapshot.delete({ where: { id } });
  revalidatePath("/evolucion");
  return getInstagramSnapshots();
}
