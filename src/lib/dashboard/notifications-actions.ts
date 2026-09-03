"use server";

// Lo que la campana del Topbar puede pedirle al server. Separado de
// notifications.ts a propósito: acá todo lo exportado es invocable desde el
// navegador, así que solo puede estar lo que un usuario tiene derecho a
// hacer sobre SUS avisos. Crearlos no está — ver el comentario de ese archivo.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCommentWhen } from "@/lib/dashboard/format";
import { NOTIFICATIONS_LIMIT } from "@/lib/dashboard/notifications";
import type { NotificationItem, NotificationKind, NotificationsSnapshot } from "@/types/dashboard";

/** Snapshot vacío — lo que se devuelve sin sesión, en vez de tirar. La
 * campana se pinta en el Topbar de todas las pantallas y consulta sola cada
 * tanto; si la sesión venció mientras la pestaña estaba abierta, eso tiene
 * que dar "no hay nada", no un error rojo en la consola cada minuto. */
const VACIO: NotificationsSnapshot = { items: [], unread: 0 };

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  actor: string;
  readAt: Date | null;
  createdAt: Date;
};

function toItem(row: NotificationRow, now: Date): NotificationItem {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    url: row.url ?? undefined,
    actor: row.actor,
    read: row.readAt !== null,
    when: formatCommentWhen(row.createdAt, now),
  };
}

/** Los avisos de quien está mirando, del más nuevo al más viejo, más el
 * contador de no leídos.
 *
 * Las dos consultas van juntas y no en dos acciones separadas porque la
 * campana siempre necesita las dos cosas a la vez: partirlas duplicaría el
 * round-trip y dejaría abierta la ventana en la que el número dice 3 y la
 * lista muestra 4. */
export async function getNotifications(): Promise<NotificationsSnapshot> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return VACIO;

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATIONS_LIMIT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const now = new Date();
  return { items: rows.map((row) => toItem(row, now)), unread };
}

/** Marca uno como leído. El `userId` va en el WHERE y no solo el id: sin eso,
 * cualquiera con un id ajeno podría marcar como leído el aviso de otro. Por
 * eso es updateMany y no update — filtra por los dos y no encontrar nada es
 * un no-op, no una excepción. */
export async function markNotificationRead(id: string): Promise<NotificationsSnapshot> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return VACIO;

  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return getNotifications();
}

/** Marca como leídos todos los del usuario. Solo toca los que están sin leer
 * para no pisar la fecha de lectura de los que ya lo estaban. */
export async function markAllNotificationsRead(): Promise<NotificationsSnapshot> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return VACIO;

  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return getNotifications();
}
