"use client";

import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";

const COLD_AUDIENCE_REELS = [
  "https://www.instagram.com/p/DZQH5FACKF4/",
  "https://www.instagram.com/p/DbYVYbiCAYH/",
  "https://www.instagram.com/p/DawUI9bPym7/",
];

const ASMR_REELS = [
  "https://www.instagram.com/p/DbMPJG0DabW/",
  "https://www.instagram.com/p/DacOQnrGKbI/?img_index=5",
  "https://www.instagram.com/reels/DUkY_SRkSW6/",
];

const GASTRONOMIC_PROPOSAL_CAROUSELS = [
  "https://www.instagram.com/p/DbP9cuzESKS/?img_index=4",
  "https://www.instagram.com/p/Dad0h6QD93-/?img_index=4",
];

/** Instagram acepta el mismo contenido bajo /p/, /reel/ o /reels/ — para el
 * iframe de /embed siempre se usa /p/, así que se extrae el shortcode de
 * cualquiera de las tres formas (y se descartan query params tipo
 * ?img_index=N de los carruseles) en vez de asumir una URL con formato fijo. */
function toEmbedSrc(url: string): string {
  const shortcode = url.match(/instagram\.com\/(?:p|reel|reels)\/([^/?]+)/)?.[1] ?? "";
  return `https://www.instagram.com/p/${shortcode}/embed`;
}

const LEVELS = [
  {
    number: "01",
    title: "Dirección Visual",
    lead: "Cómo se ve la marca.",
    body: "Cambios sutiles en el diseño gráfico: una propuesta visual depurada y atemporal, alineada con la cultura coreana y diferenciada de las propuestas actuales en RD.",
  },
  {
    number: "02",
    title: "Contenido",
    lead: "Dar valor al arte de los procesos",
    body: "Revalorizar la propuesta gastronómica mostrando el proceso detrás de cada plato: las manos, las texturas, los detalles que distinguen a Palacio Gung de otras propuestas.",
  },
];

export default function MoodboardPage() {
  const { brandName } = useBrand();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="moodboard" planLabel={brandName} />
      <div className="h-px shrink-0 bg-line" />

      <div className="flex-1 px-4 py-12 desktop:px-16 desktop:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:mb-16 desktop:text-[44px]">
            Tres niveles de <span className="font-bold">intervención</span>
          </h2>

          <div className="grid gap-10 desktop:grid-cols-3">
            {LEVELS.map((level) => (
              <div key={level.number} className="border-t border-line pt-6">
                <div className="mb-5 text-xs tracking-label text-tx-3">{level.number}</div>
                <h3 className="mb-4 text-2xl font-bold text-brand-ink">{level.title}</h3>
                <p className="mb-6 text-[15px] text-tx-2">{level.lead}</p>
                <p className="text-[15px] leading-relaxed text-tx-2">{level.body}</p>
              </div>
            ))}

            <div className="rounded-lg border border-brand-blue bg-panel-2 p-8 desktop:p-10">
              <div className="mb-5 text-xs tracking-label text-brand-blue">03</div>
              <h3 className="mb-4 text-2xl font-bold text-brand-ink">Ads</h3>
              <p className="mb-8 text-[15px] text-tx-2">Nuevo enfoque, nuevas audiencias.</p>
              <p className="mb-8 text-[15px] leading-relaxed font-semibold text-brand-ink">
                Nueva segmentación de audiencias por intereses gastronómicos premium.
              </p>
              <p className="mb-8 text-[15px] leading-relaxed text-tx-2">
                Análisis con IA y medición de métricas nuevas a 60 días.
              </p>
              <p className="text-[15px] leading-relaxed text-tx-2">
                Audiencias personalizadas y similares (lookalike) para segmentar por zona donde vive el nuevo
                cliente objetivo de la marca.
              </p>
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <h2 className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]">
              Captación de público frío.
            </h2>
            <p className="mb-12 max-w-3xl text-[15px] leading-relaxed text-tx-2 desktop:mb-16">
              Reels con narrativa y voz en off, que utilizaremos para promocionar el restaurant a nuevas
              audiencias que aún no los conocen, zonas específicas de la ciudad, con el objetivo de generar
              interacciones.
            </p>

            {/* iframe directo a /embed en vez del widget embed.js: ese
                widget mide el ancho del contenedor una sola vez al cargar y
                genera un iframe de tamaño fijo (se recortaba con
                overflow-hidden si el layout todavía no había asentado su
                ancho final) — acá el iframe llena su contenedor al 100% y
                el aspect-ratio 9:16 (formato reel) lo controla el layout,
                no Instagram. El chrome interno (header, "Ver perfil",
                like/comentar) sigue siendo el de Instagram — no se puede
                re-tematizar, vive en un documento cross-origin. */}
            <div className="grid gap-6 desktop:grid-cols-3">
              {COLD_AUDIENCE_REELS.map((url) => (
                <div key={url} className="aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2">
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Reel de Instagram"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <h2 className="mb-12 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:mb-16 desktop:text-[36px]">
              Reels visuales ASMR, con narrativa visual
            </h2>

            <div className="grid gap-6 desktop:grid-cols-3">
              {ASMR_REELS.map((url) => (
                <div key={url} className="aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2">
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Reel de Instagram"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <h2 className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]">
              Propuesta gastronómica específica
            </h2>
            <p className="mb-12 max-w-3xl text-[15px] leading-relaxed text-tx-2 desktop:mb-16">
              Carruseles que proponen un menú con pasos establecidos, para degustación, enfocado en públicos
              específicos.
            </p>

            {/* Solo dos ítems — se limita el ancho de la grilla (en vez de
                estirarla a max-w-6xl) para que las tarjetas mantengan el
                mismo tamaño que las de 3 columnas de arriba, no el doble. */}
            <div className="grid max-w-[760px] gap-6 desktop:grid-cols-2">
              {GASTRONOMIC_PROPOSAL_CAROUSELS.map((url) => (
                <div key={url} className="aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2">
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Carrusel de Instagram"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
