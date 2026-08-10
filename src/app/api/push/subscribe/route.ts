import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  }

  const body = (await request.json()) as SubscribeBody;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    // userId también en el update: si este mismo endpoint (navegador/
    // dispositivo compartido) se resuscribe con otra sesión, la suscripción
    // pasa a pertenecer a quien está logueado ahora, no a quien la creó.
    update: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: session.user.id },
    create: {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
