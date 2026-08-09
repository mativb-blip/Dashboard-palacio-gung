"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type Ref } from "react";
import { handleLiquidPointerEnter, LIQUID_FILL_CLASS, LIQUID_GROW_CLASS, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";

export interface SegmentedItem {
  key: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  href?: string;
}

interface SegmentedGroupProps {
  items: SegmentedItem[];
}

const segmentClass =
  "relative z-10 flex cursor-pointer items-center px-4 py-3 text-xs leading-none font-bold tracking-[0.06em] uppercase transition-colors duration-150 desktop:px-[18px] desktop:py-[9px]";

interface Rect {
  left: number;
  width: number;
}

/** Un "salto" entre dos rects: keyframe de llegada (contraído al tamaño del
 * segmento b) precedido por un keyframe de estiramiento (la unión de a/b,
 * exagerada 8% y achatada verticalmente — squash-and-stretch). */
function pushLegKeyframes(keyframes: Keyframe[], a: Rect, b: Rect, legStart: number, legEnd: number) {
  const legMid = (legStart + legEnd) / 2;
  const unionLeft = Math.min(a.left, b.left);
  const unionRight = Math.max(a.left + a.width, b.left + b.width);
  const pad = (unionRight - unionLeft) * 0.08;
  keyframes.push({
    left: `${unionLeft - pad}px`,
    width: `${unionRight - unionLeft + pad * 2}px`,
    transform: "scaleY(0.8)",
    offset: legMid,
  });
  keyframes.push({ left: `${b.left}px`, width: `${b.width}px`, transform: "scaleY(1)", offset: legEnd });
}

/** Grupo de segmentos (Slider/Grilla, Calendario/Post/Grilla) con un único
 * indicador azul que se desliza entre ellos al cambiar la selección.
 *
 * En vez de una transición lineal de left/width, cada salto entre dos
 * segmentos ESTIRA el indicador hasta la unión de ambos (como una gota de
 * líquido que se alarga) y recién ahí se contrae — vía Web Animations API,
 * porque un `transition` de CSS no puede expresar un punto intermedio
 * dinámico. Si el destino no es adyacente (ej. Calendario→Grilla saltando
 * Post), el indicador pasa físicamente por cada parada intermedia en vez de
 * estirarse directo de punta a punta — un salto por cada segmento del medio.
 * Maneja interrupciones: si se hace click de nuevo a mitad de camino, mide
 * la posición VISUAL actual del indicador (no la última posición "de
 * destino") y sigue desde ahí. */
export default function SegmentedGroup({ items }: SegmentedGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const currentAnimRef = useRef<Animation | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const activeIndex = items.findIndex((item) => item.active);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicatorEl = indicatorRef.current;
    if (!container || !indicatorEl) return;

    if (activeIndex === -1) {
      indicatorEl.style.display = "none";
      prevIndexRef.current = null;
      return;
    }
    indicatorEl.style.display = "block";

    const activeEl = itemRefs.current[items[activeIndex].key];
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const newLeft = activeRect.left - containerRect.left;
    const newWidth = activeRect.width;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prevIndex = prevIndexRef.current;

    if (prevIndex === null || prevIndex === activeIndex || reduceMotion) {
      currentAnimRef.current?.cancel();
      indicatorEl.style.left = `${newLeft}px`;
      indicatorEl.style.width = `${newWidth}px`;
      prevIndexRef.current = activeIndex;
      return;
    }

    // Posición VISUAL actual (no la última posición "de destino") — así una
    // interrupción a mitad de camino sigue desde donde realmente está.
    const fromRect = indicatorEl.getBoundingClientRect();
    const fromLeft = fromRect.left - containerRect.left;
    const fromWidth = fromRect.width;

    // Paradas intermedias entre el índice anterior y el nuevo (ambos
    // excluidos del rango de recorrido salvo el destino final).
    const step = activeIndex > prevIndex ? 1 : -1;
    const stopIndices: number[] = [];
    for (let i = prevIndex + step; ; i += step) {
      stopIndices.push(i);
      if (i === activeIndex) break;
    }
    const stops: Rect[] = [
      { left: fromLeft, width: fromWidth },
      ...stopIndices.map((idx) => {
        const rect = itemRefs.current[items[idx].key]!.getBoundingClientRect();
        return { left: rect.left - containerRect.left, width: rect.width };
      }),
    ];

    const legs = stops.length - 1;
    const keyframes: Keyframe[] = [
      { left: `${stops[0].left}px`, width: `${stops[0].width}px`, transform: "scaleY(1)", offset: 0 },
    ];
    for (let i = 0; i < legs; i++) {
      pushLegKeyframes(keyframes, stops[i], stops[i + 1], i / legs, (i + 1) / legs);
    }

    currentAnimRef.current?.cancel();
    currentAnimRef.current = indicatorEl.animate(keyframes, {
      duration: 100 * legs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    });
    indicatorEl.style.left = `${newLeft}px`;
    indicatorEl.style.width = `${newWidth}px`;
    prevIndexRef.current = activeIndex;
    // Solo debe re-correr cuando cambia el índice activo, no en cada render
    // (items es un array literal nuevo por render en los llamadores;
    // incluirlo re-animaría en cada render ajeno a un cambio real de selección).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0 overflow-hidden rounded border border-line-2">
      <span ref={indicatorRef} aria-hidden className="absolute inset-y-0 left-0 z-0 hidden bg-brand-blue" />
      {items.map((item) => {
        const className = `${segmentClass} ${PRESS_SCALE_CLASS} ${
          item.active ? "text-white" : `text-tx-2 hover:bg-panel-2 ${LIQUID_FILL_CLASS} ${LIQUID_GROW_CLASS}`
        }`;
        const setRef = (el: HTMLElement | null) => {
          itemRefs.current[item.key] = el;
        };

        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              ref={setRef as Ref<HTMLAnchorElement>}
              onPointerEnter={item.active ? undefined : handleLiquidPointerEnter}
              className={className}
            >
              <span className="relative">{item.label}</span>
            </Link>
          );
        }

        if (item.onClick) {
          return (
            <button
              key={item.key}
              type="button"
              ref={setRef as Ref<HTMLButtonElement>}
              onClick={item.onClick}
              onPointerEnter={item.active ? undefined : handleLiquidPointerEnter}
              className={className}
            >
              <span className="relative">{item.label}</span>
            </button>
          );
        }

        return (
          <span key={item.key} ref={setRef as Ref<HTMLSpanElement>} className={className}>
            <span className="relative">{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}
