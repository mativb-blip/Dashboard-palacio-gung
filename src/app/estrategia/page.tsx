"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/** Fade + slide-up apenas el bloque entra en el viewport — una sola vez
 * (desconecta el observer al entrar, no vuelve a ocultarse si se sale de
 * cuadro). `delay` en ms escalona la cascada de una grilla según el índice
 * del ítem (ver usos con `delay={i * 90}`). Sigue usándose para bloques que
 * no son texto (tarjetas enteras, embeds de Instagram) — el texto en sí usa
 * SplitReveal, letra o palabra por palabra. */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-in={inView}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      className={`reveal-item ${className}`}
    >
      {children}
    </div>
  );
}

interface HeadingSegment {
  text: string;
  className?: string;
}

/** Títulos: reveal letra por letra al entrar en el viewport — clonado del
 * tratamiento real de la referencia (clevante.cz, inspeccionado su DOM:
 * cada carácter en su propio nodo, con stagger creciente).
 * `text` acepta un string simple o un array de segmentos con su propia
 * className — un título como "Tres niveles de intervención" mezcla peso
 * normal y bold a mitad de frase.
 *
 * Cuerpo de texto (`unit="blur"`): sin split de por medio — todo el bloque
 * pasa de desenfocado/opacidad 0 a nítido/opacidad 1 atado directamente al
 * scroll (`scrub: true`, no "once"): a mitad de camino entre el inicio y el
 * fin del rango, el texto está a mitad de desenfoque/opacidad, sin importar
 * si se sigue bajando o se vuelve a subir. */
function SplitReveal({
  text,
  className = "",
  as: Tag = "h2",
  unit = "char",
  delay = 0,
}: {
  text: string | HeadingSegment[];
  className?: string;
  as?: "h2" | "h3" | "p";
  unit?: "char" | "blur";
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const segments: HeadingSegment[] = typeof text === "string" ? [{ text }] : text;
  const plainText = segments.map((s) => s.text).join("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (unit === "blur") {
      if (reduceMotion) {
        gsap.set(el, { opacity: 1, filter: "blur(0px)" });
        return;
      }

      gsap.set(el, { opacity: 0, filter: "blur(12px)" });
      const tween = gsap.to(el, {
        opacity: 1,
        filter: "blur(0px)",
        ease: "none",
        scrollTrigger: {
          trigger: el,
          // Arranca casi al borde de abajo y termina en apenas 130px de
          // scroll — con la ventana vieja (90%→+300px) alcanzaba con
          // pausar el scroll un momento (leyendo el párrafo) para que
          // quedara atrapado a mitad de desenfoque; acortar la distancia
          // hace que ya esté resuelto bastante antes de que el texto llegue
          // a una posición cómoda para leer.
          start: "top 95%",
          end: "+=130",
          scrub: true,
        },
      });
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    }

    const chars = el.querySelectorAll<HTMLSpanElement>("[data-part]");
    if (reduceMotion) {
      gsap.set(chars, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(chars, { opacity: 0, y: 24 });
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        gsap.to(chars, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          delay: delay / 1000,
          ease: "power3.out",
          stagger: 0.02,
        });
      },
    });
    return () => trigger.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al montar (una revelación única, no en cada re-render por cambio de props)
  }, []);

  if (unit === "blur") {
    return (
      <Tag ref={ref as never} className={className}>
        {plainText}
      </Tag>
    );
  }

  return (
    <Tag ref={ref as never} className={className} aria-label={plainText}>
      <span aria-hidden="true">
        {segments.map((segment, si) =>
          segment.text.split("").map((char, ci) =>
            char === " " ? (
              <span key={`${si}-${ci}`}> </span>
            ) : (
              <span
                key={`${si}-${ci}`}
                data-part
                className={`inline-block will-change-transform ${segment.className ?? ""}`}
              >
                {char}
              </span>
            ),
          ),
        )}
      </span>
    </Tag>
  );
}

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

const OCCASIONS = [
  {
    title: "Almuerzo corporativo",
    body: "La selección de platos responde a un criterio: mesa compartida. Piezas de alto valor visual que se sirven al centro, donde cada comensal toma su porción sin que nadie tenga que decidir por separado. La experiencia es participativa sin ser informal. El servicio anticipa, no interrumpe — banchan completo desde el inicio, reposición sin necesidad de pedirla. Bebida premium disponible desde el arranque. El tiempo de la reunión manda; la cocina se adapta a ese ritmo, no al revés.",
  },
  {
    title: "Noche de mujeres",
    body: "Platos de porción controlada, presentación limpia, sin protagonismo de la grasa. La propuesta permite probar varios sabores sin comprometerse con un solo plato de alto volumen. Variedad sin saturación. El formato de la mesa invita a compartir, no a comer en paralelo. El miércoles con identidad propia es una ocasión construida, no una salida de relleno entre semana.",
  },
  {
    title: "Cena familiar",
    body: "La mesa tiene que funcionar para dos velocidades distintas. Para los niños: texturas fáciles, formatos que se comen con las manos, algo que pase por actividad antes que por comida. Para los padres: profundidad de sabor, platos que reconfortan. El momento de cocinar en la mesa es el centro — convierte la cena en algo que se recuerda, no solo en algo que se consume.",
  },
];

const PUBLICATION_PLAN = [
  {
    title: "Contenido semanal",
    body: "Dos publicaciones por semana. Un reel y un carrusel o post simple, alternados según el momento del mes y el objetivo de cada pieza. El reel trabaja siempre hacia awareness y proceso. El carrusel o post simple profundiza — un plato, una ocasión, una propuesta gastronómica específica.",
  },
  {
    title: "Historias",
    body: "Tres historias semanales pautadas, dirigidas a la audiencia personalizada construida durante el mes. No son contenido orgánico de relleno — cada historia responde a uno de los tres escenarios de activación y tiene un CTA directo.",
  },
  {
    title: "Ads",
    body: "Creación, configuración, lanzamiento y evaluación de campañas en Meta. Cuando el rendimiento de una pieza lo justifica, se produce material nuevo. La pauta no se sostiene sobre creativos agotados — si una pieza dejó de convertir, se reemplaza, no se sube el presupuesto.",
  },
];

const METRICS = [
  {
    label: "Costo por interacción",
    body: "Mide si el reel de awareness está llegando a la audiencia correcta al precio correcto. Si este número es alto, el problema está en el creativo o en la segmentación, no en el presupuesto.",
  },
  {
    label: "Costo por clic",
    body: "Mide si el carrusel de consideración está generando intención real. Un clic hacia el perfil o hacia un CTA de reserva vale más que diez reproducciones pasivas.",
  },
  {
    label: "Contactos o reservas generadas",
    body: "Mide si la etapa de activación está convirtiendo ocasión en visita. Este es el único número que el cliente puede conectar directamente con ingreso.",
  },
];

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

/** Los 7 frameworks de copy: 1 principal para el día a día y 6 alternativos
 * para cubrir otros registros (evento, relleno, marca, engagement, premium)
 * sin que la cuenta se vuelva monótona. `example` es un caption real de
 * muestra, no una descripción — por eso se muestra citado. */
const CONTENT_FRAMEWORKS = [
  {
    icon: "🍽️",
    kind: "Principal",
    title: "Nombre / Historia y técnica / Cierre",
    body: "El formato base para el día a día. Nombra el plato (español + coreano + pronunciación), dos o tres frases de contexto cultural + una técnica real de GUNG, cierra con una acción y el hashtag.",
    example:
      "Samgyeopsal · 삼겹살 (se pronuncia «sam-gyop-sal»). La panceta más pedida en Corea, servida recién dorada en la plancha de tu propia mesa. Ideal para compartir en grupo. Pídela en tu próxima visita 🔥 #PalacioGung",
  },
  {
    icon: "🌱",
    kind: "Alternativo A",
    title: "Redefinición cultural",
    body: "Abre negando lo obvio para dar contexto. Funciona muy bien para conceptos coreanos sin equivalente directo en la cultura dominicana (ssam, banchan, jeongol).",
    example: "El Ssam no es un plato, es la forma en que en Corea se come en grupo, un bocado a la vez.",
  },
  {
    icon: "🗓️",
    kind: "Alternativo B",
    title: "Ficha técnica corta (solo eventos/especiales)",
    body: "La versión más comercial: nombre, ingredientes concretos, precio o fecha, cierre tipo «reserva ya». Exclusiva de lanzamientos o menús por tiempo limitado — nunca para el post de todos los días.",
    example:
      "Cena de Bossam para compartir, este viernes. Panceta hervida con especias + kimchi añejo + guarniciones tradicionales. RD$1,900 por persona, cupos limitados — reserva por DM.",
  },
  {
    icon: "⚡",
    kind: "Alternativo C",
    title: "Sensorial en dos líneas",
    body: "Nombre + una frase corta y evocadora de textura, sonido o temperatura. El formato más rápido de escribir y el más fotogénico — bueno para contenido de relleno.",
    example: "Tteokbokki · 떡볶이. Picante, pegajoso, recién salido del sartén #PalacioGung",
  },
  {
    icon: "🏮",
    kind: "Alternativo D",
    title: "Historia de marca / pilares",
    body: "Sin plato protagonista. Un párrafo sobre la trayectoria de Palacio Gung, el equipo o un valor (tradición, familia, hospitalidad). Se usa con moderación — quizá una vez al mes.",
    example:
      "Detrás de cada plato hay una cocina que no improvisa: las mismas recetas, el mismo cuidado, desde el primer día que abrimos las puertas.",
  },
  {
    icon: "❓",
    kind: "Alternativo E",
    title: "Reto o pregunta con respuesta incluida",
    body: "Hace una pregunta a la audiencia, pero revela la respuesta en el mismo caption o en el primer comentario. Mantiene el engagement sin dejar a nadie con la duda.",
    example:
      "¿Sabes qué hace que este kimchi sepa distinto a todos los demás? Lleva más de seis meses fermentando — por eso se llama mugeunji, «el añejo».",
  },
  {
    icon: "✨",
    kind: "Alternativo F",
    title: "Alta cocina / tesis sensorial",
    body: "Abre con el ingrediente protagonista, no con el nombre popular del plato. Sin precio, sin emojis, cierre como invitación a la experiencia. Reservado para 1-2 platos «insignia» al mes.",
    example:
      "El kimchi que fermenta más de seis meses gana un carácter distinto: más ácido, más profundo, casi terroso.",
  },
];

/** Pila de tarjetas que se tapan entre sí al hacer scroll (ver
 * `.manifesto-card` en globals.css): cada tarjeta queda pegada arriba y la
 * siguiente sube por encima, y mientras eso pasa el scroll le baja el brillo
 * a la que está quedando atrás.
 *
 * Cada tarjeta es una fila de 12 columnas: ícono + título (5), las dos
 * columnas de texto (3 + 3) y el número al borde (1). */
function FrameworkStack() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Sin animación de brillo si se pidió menos movimiento — el apilado en sí
    // se conserva (es comportamiento de layout, no un desplazamiento
    // inesperado), y el CSS ya anula el filter en ese caso.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>(".manifesto-card"));
    // La última no se atenúa nunca: no hay ninguna tarjeta que la tape.
    const tweens = cards.slice(0, -1).map((card) =>
      gsap.to(card, {
        "--brightness": 0.32,
        ease: "none",
        scrollTrigger: {
          trigger: card,
          // Arranca justo cuando la tarjeta se pega arriba y termina un alto
          // de tarjeta después — que es exactamente cuando la siguiente
          // terminó de taparla. Medido en vivo (función) y no con un número
          // fijo porque las tarjetas no miden todas lo mismo, y el alto
          // cambia al redimensionar.
          start: "top top",
          end: () => `+=${card.offsetHeight}`,
          scrub: true,
        },
      }),
    );

    return () => {
      tweens.forEach((tween) => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    };
  }, []);

  return (
    <div ref={rootRef}>
      {CONTENT_FRAMEWORKS.map((framework, i) => (
        <article
          key={framework.kind}
          className="manifesto-card grid grid-cols-1 items-start gap-x-6 gap-y-6 border-t border-line bg-[var(--bg)] py-10 min-[992px]:min-h-[62vh] min-[992px]:grid-cols-12 min-[992px]:gap-x-8 min-[992px]:py-14"
        >
          <div className="min-[992px]:col-span-5">
            <div className="mb-4 text-2xl leading-none" aria-hidden="true">
              {framework.icon}
            </div>
            <div className="mb-3 text-xs tracking-label text-tx-3 uppercase">{framework.kind}</div>
            <h3 className="manifesto-card-heading text-2xl leading-[1.15] font-bold text-balance text-brand-ink desktop:text-3xl">
              {framework.title}
            </h3>
          </div>

          <p className="text-[15px] leading-relaxed text-tx-2 min-[992px]:col-span-3">{framework.body}</p>

          <blockquote className="border-l-2 border-brand-blue pl-4 text-[15px] leading-relaxed text-tx-2 italic min-[992px]:col-span-3">
            {framework.example}
          </blockquote>

          <div className="manifesto-card-number text-xs text-tx-3 tabular-nums min-[992px]:col-span-1 min-[992px]:text-right">
            {String(i + 1).padStart(2, "0")}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Botón flotante para volver al inicio — la página es larga (varias
 * pantallas de scroll) y no tiene un nav fijo que lo compense. Aparece
 * recién a partir de cierto scroll (inútil, y visualmente ruidoso, arriba
 * del todo) y usa scroll instantáneo si el usuario prefiere menos
 * movimiento (`prefers-reduced-motion`). */
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 480);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Volver al inicio"
      title="Volver al inicio"
      className={`fixed right-5 bottom-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-panel-2/90 text-brand-ink shadow-lg backdrop-blur transition-[opacity,transform,border-color,color] duration-[400ms] hover:border-brand-blue hover:text-brand-blue motion-safe:active:scale-[0.97] desktop:right-8 desktop:bottom-8 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0 translate-y-2"
      }`}
    >
      <ArrowUpIcon />
    </button>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export default function EstrategiaPage() {
  const { brandName } = useBrand();

  return (
    <div className="flex min-h-screen flex-col font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="estrategia" planLabel={brandName} />
      <div className="h-px shrink-0 bg-line" />

      {/* pb más generoso que el pt: el scrub de blur/opacidad de los últimos
          párrafos necesita margen de scroll DESPUÉS de que entran en
          pantalla (ver "+=300" en SplitReveal) — sin este colchón, el
          documento se queda sin scroll antes de que la animación llegue a
          completarse y el texto quedaba desenfocado para siempre. */}
      <div className="flex-1 px-4 pt-12 pb-32 desktop:px-16 desktop:pt-20 desktop:pb-48">
        <div className="mx-auto max-w-6xl">
          <SplitReveal
            text={[{ text: "Tres niveles de " }, { text: "intervención", className: "font-bold" }]}
            className="mb-12 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:mb-16 desktop:text-[44px]"
          />

          <div className="dim-group grid gap-10 desktop:grid-cols-3">
            {LEVELS.map((level, i) => (
              <Reveal key={level.number} delay={i * 90} className="dim-item border-t border-line pt-6">
                <div className="mb-5 text-xs tracking-label text-tx-3">{level.number}</div>
                <h3 className="mb-4 text-2xl font-bold text-brand-ink">{level.title}</h3>
                <SplitReveal as="p" unit="blur" text={level.lead} className="mb-6 text-[15px] text-tx-2" />
                <SplitReveal
                  as="p"
                  unit="blur"
                  text={level.body}
                  className="text-[15px] leading-relaxed text-tx-2"
                />
              </Reveal>
            ))}

            <Reveal delay={180} className="dim-item rounded-lg border border-brand-blue bg-panel-2 p-8 desktop:p-10">
              <div className="mb-5 text-xs tracking-label text-brand-blue">03</div>
              <h3 className="mb-4 text-2xl font-bold text-brand-ink">Ads</h3>
              <SplitReveal
                as="p"
                unit="blur"
                text="Nuevo enfoque, nuevas audiencias."
                className="mb-8 text-[15px] text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                text="Nueva segmentación de audiencias por intereses gastronómicos premium."
                className="mb-8 text-[15px] leading-relaxed font-semibold text-brand-ink"
              />
              <SplitReveal
                as="p"
                unit="blur"
                text="Análisis con IA y medición de métricas nuevas a 60 días."
                className="mb-8 text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                text="Audiencias personalizadas y similares (lookalike) para segmentar por zona donde vive el nuevo cliente objetivo de la marca."
                className="text-[15px] leading-relaxed text-tx-2"
              />
            </Reveal>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Captación de público frío."
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <div className="mb-12 flex max-w-3xl flex-col gap-4 desktop:mb-16">
              <SplitReveal
                as="p"
                unit="blur"
                text="La pauta de esta etapa llega solo a personas que nunca han visto la marca. Excluimos a quienes ya siguen la cuenta o interactuaron con ella, para que cada peso invertido trabaje hacia adentro, no hacia quien ya sabe que Palacio Gung existe."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={80}
                text="El creativo es un reel de proceso. No el plato terminado — el proceso. Manos, texturas, el momento antes del emplatado. Eso es lo que diferencia a Palacio Gung de cualquier restaurante que publica foto de producto y llama a eso contenido."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={160}
                text="La segmentación se concentra en zonas de Santo Domingo con perfil medio-alto. No por alcance, sino por afinidad con la propuesta."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={240}
                text="El objetivo de esta etapa no es reserva ni pedido. Es interacción. Cada reacción, comentario o guardado construye la audiencia que activa la siguiente fase."
                className="text-[15px] leading-relaxed text-tx-2"
              />
            </div>

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
              {COLD_AUDIENCE_REELS.map((url, i) => (
                <Reveal
                  key={url}
                  delay={i * 90}
                  className="mx-[10%] aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2 desktop:mx-0"
                >
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Reel de Instagram"
                  />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Reels visuales ASMR, con narrativa."
              className="mb-12 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:mb-16 desktop:text-[36px]"
            />

            <div className="grid gap-6 desktop:grid-cols-3">
              {ASMR_REELS.map((url, i) => (
                <Reveal
                  key={url}
                  delay={i * 90}
                  className="mx-[10%] aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2 desktop:mx-0"
                >
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Reel de Instagram"
                  />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Activación por perfil de cliente"
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <div className="mb-12 flex max-w-3xl flex-col gap-4 desktop:mb-16">
              <SplitReveal
                as="p"
                unit="blur"
                text="Quien llega aquí ya sabe que Palacio Gung existe. No hay que presentar el restaurante ni explicar qué es la comida coreana. Esta etapa hace otra cosa: toma ese conocimiento y lo ancla a un momento concreto."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={80}
                text="La cocina coreana tradicional no se improvisa. Tiene proceso, tiene técnica, tiene una cultura detrás que no se puede fingir. Eso es exactamente lo que convierte cada ocasión en un argumento — no una promesa de marketing, sino algo que quien ya vio el contenido puede reconocer como real."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={160}
                text="La pauta llega a dos grupos: quienes ya interactuaron con la cuenta, y audiencias similares construidas desde ese comportamiento. Historias. Mensaje directo. Sin introducción, porque la audiencia no la necesita."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={240}
                text="Tres ocasiones distintas. Una sola cocina que las sostiene a todas."
                className="text-[15px] leading-relaxed text-tx-2"
              />
            </div>

            {/* Solo dos ítems — se limita el ancho de la grilla (en vez de
                estirarla a max-w-6xl) para que las tarjetas mantengan el
                mismo tamaño que las de 3 columnas de arriba, no el doble. */}
            <div className="grid max-w-[760px] gap-6 desktop:grid-cols-2">
              {GASTRONOMIC_PROPOSAL_CAROUSELS.map((url, i) => (
                <Reveal
                  key={url}
                  delay={i * 90}
                  className="mx-[10%] aspect-[9/16] overflow-hidden rounded-lg border border-line-2 bg-panel-2 desktop:mx-0"
                >
                  <iframe
                    src={toEmbedSrc(url)}
                    className="h-full w-full"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title="Carrusel de Instagram"
                  />
                </Reveal>
              ))}
            </div>

            <div className="dim-group mt-12 grid gap-10 desktop:mt-16 desktop:grid-cols-3">
              {OCCASIONS.map((occasion, i) => (
                <Reveal key={occasion.title} delay={i * 90} className="dim-item border-t border-line pt-6">
                  <h3 className="mb-4 text-2xl font-bold text-brand-ink">{occasion.title}</h3>
                  <SplitReveal
                    as="p"
                    unit="blur"
                    text={occasion.body}
                    className="text-[15px] leading-relaxed text-tx-2"
                  />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Cierre del embudo"
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <div className="flex max-w-3xl flex-col gap-4">
              <SplitReveal
                as="p"
                unit="blur"
                text="Un embudo no termina en la conversión. Termina cuando la persona que fue a comer vuelve a ser una oportunidad."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={80}
                text="Quien llegó por un reel, reservó por una historia y vivió la experiencia, ahora tiene un criterio formado sobre Palacio Gung. Sabe lo que hay detrás de cada plato. Conoce la cocina. Esa persona no necesita ser convencida de nuevo — necesita una razón distinta para volver. Y esa razón la genera el siguiente ciclo del embudo."
                className="text-[15px] leading-relaxed text-tx-2"
              />
              <SplitReveal
                as="p"
                unit="blur"
                delay={160}
                text="El contenido que se produce cada mes no acumula solo seguidores. Acumula contexto. Cada pieza nueva llega a una audiencia que ya tiene una capa de conocimiento sobre la marca, y eso hace que cada conversión siguiente sea más barata y más rápida que la anterior. Así funciona un embudo bien ejecutado: no como campaña, sino como sistema."
                className="text-[15px] leading-relaxed text-tx-2"
              />
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Métricas de revisión a 60 días"
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <SplitReveal
              as="p"
              unit="blur"
              text="Tres números. No más."
              className="mb-12 text-[15px] leading-relaxed text-tx-2 desktop:mb-16"
            />

            <div className="dim-group grid gap-10 desktop:grid-cols-3">
              {METRICS.map((metric, i) => (
                <Reveal key={metric.label} delay={i * 90} className="dim-item border-t border-line pt-6">
                  <h3 className="mb-4 text-2xl font-bold text-brand-ink">{metric.label}</h3>
                  <SplitReveal
                    as="p"
                    unit="blur"
                    text={metric.body}
                    className="text-[15px] leading-relaxed text-tx-2"
                  />
                </Reveal>
              ))}
            </div>

            <SplitReveal
              as="p"
              unit="blur"
              text="Estos tres números son la base de la reunión de los 60 días. No para justificar el trabajo — para decidir qué ajustar y en qué dirección."
              className="mt-12 max-w-3xl text-[15px] leading-relaxed text-tx-2 desktop:mt-16"
            />
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Planificación de publicaciones"
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <SplitReveal
              as="p"
              unit="blur"
              text="La cadencia mensual está diseñada para sostener el embudo sin saturar la cuenta. Cada formato tiene un rol definido — no se publica por volumen, se publica por intención."
              className="mb-12 max-w-3xl text-[15px] leading-relaxed text-tx-2 desktop:mb-16"
            />

            <div className="dim-group grid gap-10 desktop:grid-cols-3">
              {PUBLICATION_PLAN.map((item, i) => (
                <Reveal key={item.title} delay={i * 90} className="dim-item border-t border-line pt-6">
                  <h3 className="mb-4 text-2xl font-bold text-brand-ink">{item.title}</h3>
                  <SplitReveal
                    as="p"
                    unit="blur"
                    text={item.body}
                    className="text-[15px] leading-relaxed text-tx-2"
                  />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-line pt-12 desktop:mt-28 desktop:pt-16">
            <SplitReveal
              text="Frameworks de contenido"
              className="mb-6 font-thin text-[28px] leading-[1.15] font-light text-balance text-brand-ink desktop:text-[36px]"
            />
            <SplitReveal
              as="p"
              unit="blur"
              text="El proceso, en breve."
              className="mb-6 text-[15px] leading-relaxed text-tx-2"
            />
            <SplitReveal
              as="p"
              unit="blur"
              delay={80}
              text="Auditamos la cuenta propia (@palaciogung) y 4 referencias externas (AVIA, Samurai RD, Atomix, Jungsik), cruzamos el resultado contra la carta completa de GUNG para ver qué platos nunca se habían publicado, y diagnosticamos que el copy actual no nombraba los platos ni cerraba con una acción. De ahí salieron 7 estructuras: 1 framework principal para el día a día, y 6 alternativos para cubrir otros registros (evento, relleno rápido, marca, engagement, premium) sin que la cuenta se vuelva monótona."
              className="mb-12 max-w-3xl text-[15px] leading-relaxed text-tx-2 desktop:mb-16"
            />

            <FrameworkStack />
          </div>
        </div>
      </div>

      <ScrollToTopButton />
    </div>
  );
}
