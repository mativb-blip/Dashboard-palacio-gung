import { artLabel, isVerticalFormat, supportsVideo } from "@/lib/dashboard/format";
import type { Proposal } from "@/types/dashboard";

/** Wordmark + colores de marca para el placeholder dibujado en <canvas>
 * (no puede leer una variable CSS, necesita el valor real) y para el
 * fallback del nombre de archivo cuando falta texto. */
export interface DownloadBrand {
  wordmark: string;
  slug: string;
  colorPrimary: string;
  colorAccent: string;
}

export function slugify(text: string, fallback: string): string {
  return (text || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre único por archivo: "formato-fecha-nombre-del-post-NN.ext" — el
 * índice de arte al final evita colisiones entre los artes de una misma
 * propuesta (y entre descargas hechas en momentos distintos). */
function buildArtFilename(proposal: Proposal, index: number, ext: string, brandSlug: string): string {
  const formatSlug = slugify(proposal.format, brandSlug);
  const titleSlug = slugify(proposal.title, brandSlug);
  const n = String(index + 1).padStart(2, "0");
  return `${formatSlug}-${proposal.date}-${titleSlug}-${n}.${ext}`;
}

interface ArtPlaceholderData {
  n: string;
  total: string;
  label: string;
  dimension: string;
}

/** Recrea el placeholder de ArtTile en un <canvas> para poder exportarlo como
 * PNG descargable cuando la propuesta todavía no tiene imágenes reales. */
export function drawArtPlaceholder(
  art: ArtPlaceholderData,
  vertical: boolean,
  brand: DownloadBrand,
): HTMLCanvasElement {
  const W = 1080;
  const H = vertical ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#F6F6F7";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#E2E2E6";
  ctx.lineWidth = Math.round(W * 0.004);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

  const pad = Math.round(W * 0.06);

  ctx.fillStyle = "#ECEEF1";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `300 ${Math.round(W * 0.42)}px 'Scansky',Arial,sans-serif`;
  ctx.fillText(art.n, W / 2, H / 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = brand.colorPrimary;
  ctx.font = `700 ${Math.round(W * 0.05)}px Arial,sans-serif`;
  let cx = pad;
  const cy = pad + Math.round(W * 0.05);
  const tracking = Math.round(W * 0.012);
  for (const ch of brand.wordmark) {
    ctx.fillText(ch, cx, cy);
    cx += ctx.measureText(ch).width + tracking;
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "#98989F";
  ctx.font = `400 ${Math.round(W * 0.036)}px Arial,sans-serif`;
  ctx.fillText(`${art.n} / ${art.total}`, W - pad, cy - Math.round(W * 0.006));

  const barY = H - pad - Math.round(W * 0.16);
  const barW = Math.round(W * 0.135);
  const barH = Math.round(W * 0.012);
  ctx.fillStyle = brand.colorAccent;
  ctx.fillRect(pad, barY, Math.round(barW * 0.36), barH);
  ctx.fillStyle = brand.colorPrimary;
  ctx.fillRect(pad + Math.round(barW * 0.36), barY, barW - Math.round(barW * 0.36), barH);

  ctx.textAlign = "left";
  ctx.fillStyle = "#1A1A1A";
  ctx.font = `700 ${Math.round(W * 0.055)}px Arial,sans-serif`;
  ctx.fillText(art.label, pad, barY + Math.round(W * 0.075));
  ctx.fillStyle = "#98989F";
  ctx.font = `400 ${Math.round(W * 0.04)}px Arial,sans-serif`;
  ctx.fillText(art.dimension, pad, barY + Math.round(W * 0.125));

  return canvas;
}

interface ArtFile {
  blob: Blob;
  filename: string;
}

/** Trae el arte (imagen real por fetch, o el placeholder de ArtTile
 * generado en <canvas>) sin todavía disparar ninguna descarga. */
async function getProposalArtFile(proposal: Proposal, index: number, brand: DownloadBrand): Promise<ArtFile | null> {
  // En los formatos que llevan video (Reel siempre, Historia si se cargó
  // uno) el slot 0 muestra el video: lo que hay que bajar es ese archivo, no
  // la imagen de portada.
  if (supportsVideo(proposal.format) && proposal.video && index === 0) {
    try {
      const res = await fetch(proposal.video);
      const blob = await res.blob();
      const ext = (proposal.video.split("/").pop() ?? "").split(".").pop()?.split("?")[0] || "mp4";
      return { blob, filename: buildArtFilename(proposal, index, ext, brand.slug) };
    } catch {
      return null;
    }
  }

  const src = proposal.images?.[index];

  if (src) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const ext = (src.split("/").pop() ?? "").split(".").pop()?.split("?")[0] || "png";
      return { blob, filename: buildArtFilename(proposal, index, ext, brand.slug) };
    } catch {
      return null; // si la imagen falla, no interrumpe la descarga de las demás
    }
  }

  const vertical = isVerticalFormat(proposal.format);
  const total = proposal.artN;
  const art: ArtPlaceholderData = {
    n: String(index + 1).padStart(2, "0"),
    total: String(total).padStart(2, "0"),
    label: artLabel(index, total),
    dimension: proposal.dim ?? (vertical ? "1080 × 1920 px" : "1080 × 1080 px"),
  };
  const canvas = drawArtPlaceholder(art, vertical, brand);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { blob, filename: buildArtFilename(proposal, index, "png", brand.slug) } : null;
}

/** Descarga un único arte disparando un <a download>. */
async function downloadProposalArt(proposal: Proposal, index: number, brand: DownloadBrand): Promise<void> {
  const file = await getProposalArtFile(proposal, index, brand);
  if (file) triggerDownload(file.blob, file.filename);
}

const DOWNLOAD_STEP_DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Descarga los artes indicados de a uno (no en simultáneo), sin comprimir —
 * cada uno es su propio archivo real. Con 2+ artes, la primera vez el
 * navegador puede mostrar un aviso de "este sitio quiere descargar varios
 * archivos" — hay que permitirlo una vez (ArtViewer avisa de esto en modo
 * selección); después de eso queda recordado para este sitio. */
export async function downloadProposalArts(
  proposal: Proposal,
  indices: number[],
  brand: DownloadBrand,
): Promise<void> {
  for (let i = 0; i < indices.length; i++) {
    await downloadProposalArt(proposal, indices[i], brand);
    if (i < indices.length - 1) await delay(DOWNLOAD_STEP_DELAY_MS);
  }
}
