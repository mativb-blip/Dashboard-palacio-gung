/** Compartir una propuesta por WhatsApp desde el visor de artes.
 *
 * El enlace apunta a `/?proposal=<id>`, que la home ya sabe leer (ver
 * `searchParams.get("proposal")` en src/app/page.tsx): quien lo abre cae
 * directamente en ese post, no en el dashboard genérico.
 */

import { dateLong, fmtShort } from "./format";
import type { Proposal } from "@/types/dashboard";

/** Cuánto caption se manda en el mensaje. No va entero a propósito: un
 * caption largo convierte el mensaje en un muro y encima infla la URL. La
 * idea es que se reconozca de qué post se trata; para leerlo completo está
 * el enlace. */
const CAPTION_PREVIEW_LIMIT = 300;

export function proposalShareText(proposal: Proposal, brandName: string, origin: string): string {
  const cuando = proposal.time
    ? `${dateLong(proposal.date)} · ${proposal.time}`
    : dateLong(proposal.date);

  const caption = proposal.caption?.trim() ?? "";
  const preview =
    caption.length > CAPTION_PREVIEW_LIMIT
      ? `${caption.slice(0, CAPTION_PREVIEW_LIMIT).trimEnd()}…`
      : caption;

  // Los asteriscos son el negrita de WhatsApp, no decoración.
  const lineas = [
    `*${brandName}* — ${proposal.title}`,
    `${fmtShort(proposal.format)} · ${cuando}`,
    preview ? `\n${preview}` : "",
    `\nRevisalo acá: ${origin}/?proposal=${proposal.id}`,
  ];

  return lineas.filter(Boolean).join("\n");
}

/**
 * URL de "Click to Chat" de WhatsApp.
 *
 * Sin `phone` abre WhatsApp con el mensaje ya escrito y deja elegir el
 * contacto. Se hace así porque no hay ningún teléfono guardado en la base
 * (ver schema: no existe campo de teléfono en User ni en SiteSettings), y
 * antes que inventar uno o pedirlo a mitad del flujo, es preferible un paso
 * más: elegir a Jun de la lista.
 *
 * El parámetro `phone` queda listo para el día que se guarde el número — solo
 * hay que pasárselo, en formato internacional y sin signos (ej. "18091234567").
 */
export function whatsappShareUrl(text: string, phone?: string): string {
  const base = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
