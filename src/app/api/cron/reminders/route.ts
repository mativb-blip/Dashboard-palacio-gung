import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToAll } from "@/lib/dashboard/notify-push";
import { parseProposalDateTime, todayInSantoDomingo } from "@/lib/dashboard/schedule-time";

// Llamado por un cron externo (GitHub Actions, cada 5-10 min — ver
// .github/workflows/reminders.yml) en vez de Vercel Cron: el plan Hobby de
// Vercel solo deja correr cron 1 vez por día, y esto necesita revisar todo
// el día. Dispara en el primer tick que cruza cada umbral (no en una
// ventana angosta) para tolerar el jitter del scheduler de GitHub.
const HOUR_MS = 60 * 60 * 1000;

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
  const candidates = await prisma.proposal.findMany({
    where: {
      date: { in: [addDaysToDateStr(today, -1), today, addDaysToDateStr(today, 1)] },
      OR: [{ reminderSentT60: false }, { reminderSentT0: false }],
    },
    select: { id: true, title: true, network: true, date: true, time: true, reminderSentT60: true, reminderSentT0: true },
  });

  const now = Date.now();
  let sentT60 = 0;
  let sentT0 = 0;

  for (const proposal of candidates) {
    const scheduledAt = parseProposalDateTime(proposal.date, proposal.time);
    if (!scheduledAt) continue;
    const diffMs = scheduledAt.getTime() - now;

    if (!proposal.reminderSentT60 && diffMs > 0 && diffMs <= HOUR_MS) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { reminderSentT60: true } });
      await sendPushToAll({
        title: "Falta 1 hora para publicar",
        body: `"${proposal.title}" (${proposal.network}) se publica a las ${proposal.time}.`,
      });
      sentT60++;
    }

    if (!proposal.reminderSentT0 && diffMs <= 0) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { reminderSentT0: true } });
      await sendPushToAll({
        title: "Es hora de publicar",
        body: `"${proposal.title}" (${proposal.network}) está programado para ahora.`,
      });
      sentT0++;
    }
  }

  return NextResponse.json({ checked: candidates.length, sentT60, sentT0 });
}
