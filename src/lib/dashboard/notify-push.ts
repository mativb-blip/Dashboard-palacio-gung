// Solo se importa desde proposals-actions.ts (ya "use server") — server-only,
// usa `web-push` y no debe terminar en el bundle del cliente.

import webpush from "web-push";
import { prisma } from "@/lib/db";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Nunca tira — mismo criterio que sendCommentNotification (notify-email.ts):
 * un fallo acá no debe romper el guardado del comentario. Suscripciones
 * muertas (404/410, el navegador ya las invalidó) se borran de una. */
async function sendToSubscriptions(
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[notify-push] error enviando a una suscripción:", e);
        }
      }
    }),
  );
}

/** Broadcast a todo el que tenga notificaciones activadas — usado para los
 * recordatorios de publicación/aprobación (cron), relevantes para cualquiera
 * que use la app, no solo para una persona puntual. */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return; // VAPID_* no configurado — no-op silencioso
  const subscriptions = await prisma.pushSubscription.findMany();
  await sendToSubscriptions(subscriptions, payload);
}

/** Push a las suscripciones de un usuario puntual (por email, no por id —
 * así el caller no necesita resolverlo primero). Usado por comentario nuevo
 * y post aprobado (ver proposals-actions.ts): esos dos van a una persona
 * específica (SiteSettings.pushNotifyTo), no a todos los suscriptos como
 * sendPushToAll. Si esa persona no tiene ninguna suscripción activa (nunca
 * activó notificaciones, o su usuario no existe), no-op silencioso. */
export async function sendPushToEmail(email: string, payload: PushPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return; // VAPID_* no configurado — no-op silencioso
  if (!email) return;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  await sendToSubscriptions(subscriptions, payload);
}
