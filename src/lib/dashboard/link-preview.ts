// Trae los metadatos Open Graph de un enlace para pintar su tarjeta en
// /inspiracion. Server-only: sale a internet y resuelve DNS, nada de esto
// puede correr en el navegador.
//
// LO IMPORTANTE ACÁ NO ES EL PARSEO, ES A DÓNDE SE SALE. El servidor va a
// pedir una URL que escribió otra persona, desde adentro de la red donde
// corre. Sin frenos, esto es un SSRF de manual: alguien pega
// "http://169.254.169.254/..." y le devolvemos las credenciales de la
// instancia. Los usuarios de este dashboard son de confianza, pero eso es
// una circunstancia y no una defensa — cambia el día que se agregue un rol
// nuevo o se comparta un acceso. Por eso las barreras están abajo.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Nada de esperar a un sitio caído: la carga de un enlace no puede colgarse. */
const TIMEOUT_MS = 6000;

/** Las etiquetas que buscamos viven en el <head>. Medio mega es de sobra y
 * evita descargar un HTML de varios MB para leer cuatro líneas. */
const MAX_BYTES = 512 * 1024;

/** Un enlace acortado puede rebotar un par de veces antes de llegar. Cada
 * salto se valida de nuevo: si no, la primera URL pasa el control y el
 * redirect lleva a donde quiera. */
const MAX_REDIRECTS = 3;

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  site?: string;
}

/** Rangos que no son "internet": loopback, la red privada, link-local (donde
 * viven los metadatos de las nubes) y compañía. */
function esDireccionInterna(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    // Únicas locales y link-local de IPv6.
    if (/^f[cd]/.test(v6) || v6.startsWith("fe80")) return true;
    // IPv4 mapeada dentro de IPv6 (::ffff:169.254.169.254) — se valida el v4.
    const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    return mapeada ? esDireccionInterna(mapeada[1]) : false;
  }

  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n))) return true; // no lo entiendo = no salgo
  if (o[0] === 0 || o[0] === 10 || o[0] === 127) return true;
  if (o[0] === 169 && o[1] === 254) return true; // link-local / metadatos
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT
  if (o[0] >= 224) return true; // multicast y reservados
  return false;
}

/** Deja pasar solo http/https hacia una IP pública. Resuelve el nombre para
 * decidir: mirar el texto del host no alcanza, "localtest.me" apunta a
 * 127.0.0.1 y parece un dominio cualquiera. */
async function esDestinoPermitido(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  try {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host)) return !esDireccionInterna(host);
    const { address } = await lookup(host);
    return !esDireccionInterna(address);
  } catch {
    return false;
  }
}

/** Lee el cuerpo hasta MAX_BYTES y corta. Sin esto, un archivo enorme al
 * final de un enlace inocente ocupa memoria del servidor hasta que termine. */
async function leerAcotado(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(value);
      total += value.length;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    buffer.set(parte.subarray(0, Math.min(parte.length, total - offset)), offset);
    offset += parte.length;
    if (offset >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/** Saca el `content` de un <meta> por su property/name. Tolera el orden de
 * los atributos al revés (`content` antes que `property`), que es común. */
function meta(html: string, clave: string): string | undefined {
  const k = clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patrones = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, "i"),
  ];
  for (const p of patrones) {
    const m = p.exec(html);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Decodifica las entidades que aparecen de verdad en un título. No es un
 * parser de HTML: es lo que hace falta para no mostrar "Caf&eacute;". */
function decodificar(texto: string): string {
  const nombradas: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»",
    hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  };
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (todo, n) => nombradas[n.toLowerCase()] ?? todo)
    .replace(/\s+/g, " ")
    .trim();
}

function recortar(texto: string | undefined, max: number): string | undefined {
  if (!texto) return undefined;
  const limpio = decodificar(texto);
  if (!limpio) return undefined;
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/**
 * Pide la página y devuelve lo que tenga para mostrar. **Nunca tira**: un
 * enlace sin metadatos, caído o que nos rechaza sigue siendo un enlace
 * válido para guardar — la tarjeta simplemente queda sin adorno. Devuelve un
 * objeto vacío en ese caso, que es distinto de no haber intentado.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let actual: URL;
  try {
    actual = new URL(rawUrl);
  } catch {
    return {};
  }

  try {
    let res: Response | null = null;
    for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
      if (!(await esDestinoPermitido(actual))) return {};

      const respuesta: Response = await fetch(actual, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Varios sitios devuelven una página distinta (o un 403) sin un
          // User-Agent de navegador. Se identifica como bot igual.
          "user-agent": "Mozilla/5.0 (compatible; PalacioGungDashboard/1.0; +link-preview)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "es,en;q=0.8",
        },
      });

      const location = respuesta.headers.get("location");
      if (respuesta.status >= 300 && respuesta.status < 400 && location) {
        // El siguiente salto se valida en la vuelta del for, igual que el
        // primero: un redirect a 127.0.0.1 no puede colarse.
        actual = new URL(location, actual);
        await respuesta.body?.cancel().catch(() => {});
        continue;
      }
      res = respuesta;
      break;
    }

    if (!res || !res.ok) return {};
    if (!(res.headers.get("content-type") ?? "").includes("html")) return {};

    const html = await leerAcotado(res);

    const titulo =
      meta(html, "og:title") ??
      meta(html, "twitter:title") ??
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

    const descripcion =
      meta(html, "og:description") ?? meta(html, "twitter:description") ?? meta(html, "description");

    const imagenCruda = meta(html, "og:image") ?? meta(html, "twitter:image");
    let imagen: string | undefined;
    if (imagenCruda) {
      try {
        // Relativa al documento FINAL (después de los redirects), no a la
        // que se pegó — si no, una imagen relativa apunta a otro dominio.
        const abs = new URL(decodificar(imagenCruda), actual);
        if (abs.protocol === "http:" || abs.protocol === "https:") imagen = abs.toString();
      } catch {
        // una og:image rota no invalida el resto de la tarjeta
      }
    }

    return {
      title: recortar(titulo, 200),
      description: recortar(descripcion, 300),
      image: imagen,
      site: recortar(meta(html, "og:site_name"), 80),
    };
  } catch {
    // Timeout, DNS que no resuelve, TLS vencido, el sitio nos bloquea: nada
    // de eso es un error del usuario ni impide guardar el enlace.
    return {};
  }
}
