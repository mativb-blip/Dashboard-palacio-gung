// Solo se importa desde proposals-actions.ts/route.ts (ambos server-only),
// así que nunca termina en el bundle del cliente sin necesidad de un guard
// aparte.
//
// Único canal de notificación del dashboard — vía Gmail SMTP (Nodemailer +
// contraseña de aplicación de una cuenta de Gmail dedicada a
// notificaciones). Opcional: si GMAIL_USER/GMAIL_APP_PASSWORD no están en
// .env, no hace nada. A diferencia de Microsoft Graph, el remitente queda
// fijo a esa cuenta — no varía por SiteSettings.senderEmail; ese campo se
// usa como Reply-To para que las respuestas lleguen al contacto real.

import nodemailer from "nodemailer";

interface SendCommentNotificationInput {
  proposalTitle: string;
  proposalDate: string;
  author: string;
  text: string;
  to: string;
  cc?: string;
  senderEmail: string;
}

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Nunca tira — un fallo acá (credenciales sin configurar, Gmail caído,
 * etc.) no debe romper el guardado del comentario en sí, que ya ocurrió
 * antes de llamar a esta función. */
export async function sendCommentNotification(input: SendCommentNotificationInput): Promise<void> {
  try {
    const transporter = getTransporter();
    if (!transporter) return; // GMAIL_* no configurado todavía — no-op silencioso

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: input.to,
      cc: input.cc || undefined,
      replyTo: input.senderEmail,
      subject: `Nuevo comentario en "${input.proposalTitle}"`,
      html: `<p><strong>${escapeHtml(input.author)}</strong> comentó en <strong>${escapeHtml(input.proposalTitle)}</strong> (${escapeHtml(input.proposalDate)}):</p><p>${escapeHtml(input.text).replace(/\n/g, "<br>")}</p>`,
    });
  } catch (e) {
    console.error("[notify-email] error enviando notificación:", e);
  }
}

interface SendAlertEmailInput {
  to: string;
  title: string;
  body: string;
}

/** Reemplaza lo que antes era un push (mismo par título/cuerpo) para el
 * resto de los avisos del dashboard — aprobación (por checkbox o por
 * resolver comentarios) y los recordatorios de publicación/aprobación
 * pendiente del cron. Un solo canal (mail), sin opt-in: no depende de que
 * alguien haya activado nada en su navegador. Nunca tira, mismo criterio
 * que sendCommentNotification. */
export async function sendAlertEmail(input: SendAlertEmailInput): Promise<void> {
  try {
    const transporter = getTransporter();
    if (!transporter) return; // GMAIL_* no configurado todavía — no-op silencioso

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: input.to,
      subject: input.title,
      html: `<p>${escapeHtml(input.body)}</p>`,
    });
  } catch (e) {
    console.error("[notify-email] error enviando notificación:", e);
  }
}
