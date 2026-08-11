import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendAlertEmail } from "@/lib/dashboard/notify-email";
import { APPROVAL_REMINDER_HOURS_BEFORE } from "@/lib/dashboard/proposals";
import { parseProposalDateTime, todayInSantoDomingo } from "@/lib/dashboard/schedule-time";
import { getAdminEmail } from "@/lib/dashboard/site-settings";

// Llamado por un cron externo (GitHub Actions, cada 5-10 min — ver
// .github/workflows/reminders.yml) en vez de Vercel Cron: el plan Hobby de
// Vercel solo deja correr cron 1 vez por día, y esto necesita revisar todo
// el día. Dispara en el primer tick que cruza cada umbral (no en una
// ventana angosta) para tolerar el jitter del scheduler de GitHub.
const HOUR_MS = 60 * 60 * 1000;
const APPROVAL_REMINDER_MS = APPROVAL_REMINDER_HOURS_BEFORE * HOUR_MS;

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const today = todayInSantoDomingo();
  // Ventana de 4 días — cubre el umbral de aprobación (hasta 48h antes,
  // ver APPROVAL_REMINDER_HOURS_BEFORE) además de los recordatorios de
  // publicación (1h antes/a la hora).
  const dateWindow = [-1, 0, 1, 2].map((offset) => addDaysToDateStr(today, offset));
  const candidates = await prisma.proposal.findMany({
    where: {
      date: { in: dateWindow },
      OR: [{ reminderSentT60: false }, { reminderSentT0: false }, { approvalReminderSent: false }],
    },
    select: {
      id: true,
      title: true,
      network: true,
      date: true,
      time: true,
      reminderSentT60: true,
      reminderSentT0: true,
      approvalReminderSent: true,
      departmentApprovals: true,
    },
  });

  // Todos los recordatorios van al mail del Admin — un solo destinatario
  // fijo, sin depender de que nadie haya activado nada en su navegador (ver
  // ficha de notificaciones: se sacó el opt-in de push).
  const adminEmail = await getAdminEmail();

  const now = Date.now();
  let sentT60 = 0;
  let sentT0 = 0;
  let sentApproval = 0;

  for (const proposal of candidates) {
    const scheduledAt = parseProposalDateTime(proposal.date, proposal.time);
    if (!scheduledAt) continue;
    const diffMs = scheduledAt.getTime() - now;
    const isApproved = proposal.departmentApprovals?.[0] ?? false;

    // Recordatorio de aprobación pendiente (ficha 3) — solo si todavía no
    // se aprobó; se detiene solo apenas se aprueba (updateProposal() marca
    // approvalReminderSent en false de nuevo si se invalida más adelante).
    if (!proposal.approvalReminderSent && !isApproved && diffMs > 0 && diffMs <= APPROVAL_REMINDER_MS) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { approvalReminderSent: true } });
      if (adminEmail) {
        await sendAlertEmail({
          to: adminEmail,
          title: "Aprobación pendiente",
          body: `"${proposal.title}" (${proposal.network}) se publica el ${proposal.date} ${proposal.time} y todavía no está aprobado.`,
        });
      }
      sentApproval++;
    }

    // Recordatorios de publicación (1h antes/a la hora).
    if (!proposal.reminderSentT60 && diffMs > 0 && diffMs <= HOUR_MS) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { reminderSentT60: true } });
      if (adminEmail) {
        await sendAlertEmail({
          to: adminEmail,
          title: "Falta 1 hora para publicar",
          body: `"${proposal.title}" (${proposal.network}) se publica a las ${proposal.time}.`,
        });
      }
      sentT60++;
    }

    if (!proposal.reminderSentT0 && diffMs <= 0) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { reminderSentT0: true } });
      if (adminEmail) {
        await sendAlertEmail({
          to: adminEmail,
          // Escalado simple (ficha 3, punto 4): si a la hora de publicar
          // sigue sin aprobación, el mensaje lo deja explícito en vez de
          // mandar el aviso genérico de "es la hora".
          title: isApproved ? "Es hora de publicar" : "Sin aprobar y ya es la hora de publicar",
          body: `"${proposal.title}" (${proposal.network}) está programado para ahora${isApproved ? "" : " — todavía no tiene la aprobación de Jun"}.`,
        });
      }
      sentT0++;
    }
  }

  return NextResponse.json({ checked: candidates.length, sentT60, sentT0, sentApproval });
}
