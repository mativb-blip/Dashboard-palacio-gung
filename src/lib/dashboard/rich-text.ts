/** Saneado del texto con formato del Moodboard (ver MoodboardElement.text).
 *
 * El contenido lo escribe un Admin en un `contentEditable` y después se
 * vuelve a pintar con `dangerouslySetInnerHTML` — o sea que lo que quede acá
 * se ejecuta como HTML. La política es la más restrictiva que sirve:
 * un puñado de etiquetas de formato, y CERO atributos. Sin atributos no hay
 * `onerror=`, ni `href="javascript:"`, ni `style` con `url()`; el tamaño, el
 * color y la alineación viajan en columnas aparte de la tabla, no en el HTML.
 *
 * Corre en los dos lados: en el cliente antes de guardar y en la server
 * action antes de escribir a la base (el cliente no es una frontera de
 * confianza — la action se puede llamar directo). */

const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "br",
  "div",
  "p",
  "ul",
  "ol",
  "li",
]);

/** Marcador temporal para las etiquetas que sí pasan. Usa NUL, que no puede
 * aparecer en un texto pegado desde el navegador. */
const TOKEN = "\u0000";

export function sanitizeRichText(html: string): string {
  if (!html) return "";

  // 1) Las etiquetas permitidas se reemplazan por un marcador y se guardan ya
  //    normalizadas (en minúscula y sin ningún atributo). Todo lo demás que
  //    parezca una etiqueta desaparece.
  const kept: string[] = [];
  const withTokens = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    kept.push(match.startsWith("</") ? `</${tag}>` : `<${tag}>`);
    return `${TOKEN}${kept.length - 1}${TOKEN}`;
  });

  // 2) Lo que sobrevivió no era una etiqueta válida: se escapa como texto.
  //    Así un `<div<script>` malformado (que el paso 1 no matchea) tampoco
  //    llega nunca al parser del navegador como marcado.
  const escaped = withTokens
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3) Vuelven las etiquetas permitidas.
  return escaped.replace(new RegExp(`${TOKEN}(\\d+)${TOKEN}`, "g"), (_, index: string) => kept[Number(index)] ?? "");
}

/** Tamaños de letra ofrecidos por la barra de formato, en px. */
export const TEXT_SIZES = [
  { value: 13, label: "S" },
  { value: 16, label: "M" },
  { value: 22, label: "L" },
  { value: 32, label: "XL" },
] as const;

export const DEFAULT_TEXT_SIZE = 15;

export type TextAlign = "left" | "center" | "right";
export const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right"];
