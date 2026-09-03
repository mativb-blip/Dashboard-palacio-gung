// Registro de avisos para la campana del Topbar.
//
// Se importa SOLO desde módulos server ("use server" o route handlers), igual
// que notify-email.ts. Y a propósito no es un archivo "use server": ahí todo
// lo exportado queda expuesto como server action, o sea invocable desde el
// navegador — cualquiera con sesión podría fabricarse avisos falsos a nombre
// de otro. Lo que el cliente sí puede llamar vive en notifications-actions.ts.
//
// Este canal es el TERCERO, además del mail (notify-email.ts) y el push
// (notify-push.ts), y no los reemplaza: el mail avisa cuando no estás
// mirando, la campana es el registro de lo que pasó mientras no estabas.
// Por eso registra más cosas de las que se mandan por mail — un aviso que no
// interrumpe a nadie puede permitirse ser más detallado.

import { prisma } from "@/lib/db";
import type { NotificationKind } from "@/types/dashboard";

/** Cuántos avisos devuelve la campana. Más que esto no entra en un panel
 * que se lee de un vistazo, y el contador de no leídos se calcula aparte
 * justamente para no depender de este recorte. */
export const NOTIFICATIONS_LIMIT = 40;

/** A partir de acá un aviso ya no le sirve a nadie. Ver pruneOldNotifications. */
const DIAS_DE_VIDA = 60;

interface RecordNotificationInput {
  /** Id de quien lo provocó — es el único que NO lo recibe. Si viene vacío
   * (una acción del sistema, como el cron), lo reciben todos. */
  actorId?: string | null;
  /** Nombre visible de quien lo provocó. */
  actor: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Ruta interna a la que lleva el click. */
  url?: string | null;
}

/**
 * Deja el aviso para todos menos para quien lo provocó.
 *
 * "Todos menos el actor" y no "los Admin": las dos direcciones importan. La
 * agencia necesita enterarse de lo que hace Jun (que es el pedido), y Jun
 * necesita enterarse de que le cambiaron un post — es el mismo hecho visto
 * desde el otro lado, y sostener dos reglas distintas para eso solo agrega
 * formas de equivocarse.
 *
 * NUNCA tira, mismo criterio que sendCommentNotification(): el comentario, la
 * aprobación o la edición ya ocurrieron antes de llegar acá. Un fallo del
 * registro no puede deshacerlos ni mostrarle un error a quien hizo algo que
 * sí se guardó.
 */
export async function recordNotification(input: RecordNotificationInput): Promise<void> {
  try {
    const destinatarios = await prisma.user.findMany({
      where: input.actorId ? { id: { not: input.actorId } } : {},
      select: { id: true },
    });
    if (destinatarios.length === 0) return;

    await prisma.notification.createMany({
      data: destinatarios.map((u) => ({
        userId: u.id,
        kind: input.kind,
        title: input.title,
        // El cuerpo se recorta acá y no al mostrarlo: un caption entero
        // ocuparía la campana completa, y guardarlo largo para después
        // cortarlo es pagar el espacio dos veces.
        body: input.body.slice(0, 400),
        url: input.url ?? null,
        actor: input.actor,
      })),
    });
  } catch (e) {
    console.error("[notifications] no se pudo registrar el aviso:", e);
  }
}

/** Borra los avisos viejos. Lo llama el cron de recordatorios (ya corre cada
 * 5-10 min) en vez de hacerlo en cada `recordNotification`: sería un DELETE
 * extra por cada comentario, para limpiar algo que no urge. Nunca tira. */
export async function pruneOldNotifications(): Promise<number> {
  try {
    const corte = new Date(Date.now() - DIAS_DE_VIDA * 24 * 60 * 60 * 1000);
    const { count } = await prisma.notification.deleteMany({
      where: { createdAt: { lt: corte } },
    });
    return count;
  } catch (e) {
    console.error("[notifications] no se pudieron limpiar los avisos viejos:", e);
    return 0;
  }
}
