import type { PointerEvent } from "react";
import type { Role } from "@/generated/prisma/client";

/** Admin y Editor pueden crear/editar/borrar contenido — un Comentarista
 * solo puede ver y comentar (el gate real vive en las server actions,
 * ver requireEditor() en proposals-actions.ts; esto es solo para no
 * mostrarle al Comentarista un control que el server le va a rechazar). */
export function canEditContent(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

/** Corregir y borrar ALTERNATIVAS DE CAPTION es la excepción a
 * canEditContent, y a pedido explícito: el caption es lo que Jun
 * (Comentarista) revisa y aprueba, así que puede arreglarlo él mismo en vez
 * de pedir el cambio por comentario y esperar. Mismo criterio que
 * selectCaptionOption, que ya alcanzaba con sesión.
 *
 * CREAR alternativas sigue siendo de Admin/Editor: proponer opciones nuevas
 * es trabajo de la agencia, no del cliente.
 *
 * Se listan los tres roles en vez de escribir `role !== undefined` para que
 * el día que se agregue un rol nuevo (uno de solo lectura, por ejemplo) no
 * herede este permiso por descuido. */
export function canEditCaption(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDITOR" || role === "COMMENTER";
}

/** Capa "líquida" de hover: un ::before clip-path que se expande desde el
 * punto donde entró el mouse (ver `handleLiquidPointerEnter`) en vez de
 * hacer un fundido plano. El host necesita `relative overflow-hidden`, y
 * cualquier contenido visible (texto/ícono) necesita `relative` para quedar
 * por encima — un descendiente posicionado con z-index:auto se pinta según
 * el orden del árbol (CSS 2.1 §E), y el pseudo-elemento es siempre el primero. */
export const LIQUID_FILL_CLASS =
  "before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:bg-brand-blue/15 before:[clip-path:circle(0%_at_var(--hx,50%)_var(--hy,50%))] before:transition-[clip-path] before:duration-[400ms] before:ease-out motion-safe:hover:before:[clip-path:circle(150%_at_var(--hx,50%)_var(--hy,50%))] disabled:before:opacity-0";

/** Crecimiento sutil (2%) que acompaña al líquido — mismo criterio que el
 * calendario: gateado por motion-safe, nunca en foco por teclado. */
export const LIQUID_GROW_CLASS = "motion-safe:hover:scale-[1.02]";

/** "Squeeze" al presionar — feedback táctil estándar para TODO botón/link
 * clickeable del dashboard (criterio Emil Kowalski: scale ~0.97 en :active).
 * Gateado por motion-safe; nunca dispara con teclado (:active no matchea
 * en un click por Enter/Space en la mayoría de navegadores para <button>,
 * y no se aplica ningún equivalente a :focus). */
export const PRESS_SCALE_CLASS = "motion-safe:active:scale-[0.97]";

/** Ubica el punto de entrada del mouse (en % del ancho/alto) en `--hx`/`--hy`.
 * Set directo en el DOM (no state) para no forzar un re-render por hover. */
export function handleLiquidPointerEnter(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  e.currentTarget.style.setProperty("--hx", `${x}%`);
  e.currentTarget.style.setProperty("--hy", `${y}%`);
}

/** Botón cuadrado de solo ícono (Descargar/Editar en ArtViewer, Copiar/Editar
 * caption en CaptionPanel): reposo discreto en gris, líquido azul + 2% de
 * crecimiento al hover, "squeeze" al presionar. Compartido para que no diverjan.
 * Más chico en mobile (vista Post pide botones compactos) — el ícono interno
 * ya viene a 16px, así que a 32px sigue con margen cómodo. Desktop no cambia. */
export const iconButtonClass =
  `relative flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-line-2 bg-panel-2 text-tx-2 transition-[background-color,border-color,color,transform] duration-[400ms] hover:border-brand-blue hover:text-brand-blue disabled:cursor-default disabled:opacity-60 disabled:hover:border-line-2 disabled:hover:text-tx-2 desktop:h-9 desktop:w-9 ${LIQUID_FILL_CLASS} ${LIQUID_GROW_CLASS} ${PRESS_SCALE_CLASS}`;
