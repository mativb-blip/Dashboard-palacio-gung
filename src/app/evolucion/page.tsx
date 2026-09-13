"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Topbar from "@/components/dashboard/Topbar";
import InstagramBlock from "./InstagramBlock";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { getEvolutionStats, type EvolutionStats, type Tajada } from "@/lib/dashboard/evolution-actions";
import { statusPillStyle } from "@/lib/dashboard/format";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { ProposalStatus } from "@/types/dashboard";

/**
 * Evolución: qué pasó con el contenido a lo largo del tiempo.
 *
 * UN SOLO COLOR PARA LAS MAGNITUDES. Todo lo que mide "cuánto" va en azul de
 * marca y nada más: las barras de un mismo gráfico no compiten entre sí, se
 * comparan. Los cuatro colores de estado (azul/rojo/ámbar/gris) se usan
 * únicamente donde el dato ES un estado, que es el idioma que ya hablan las
 * pills en el resto del dashboard — y ahí van SIEMPRE con su etiqueta al
 * lado, nunca el color solo. Corrido contra el validador de paletas, ese
 * cuarteto no pasa como paleta categórica (dos de sus colores quedan fuera
 * de la banda de luminosidad y dos leen como gris); se conserva igual porque
 * cambiarlo acá haría que esta pantalla contradiga a las pills de todas las
 * demás, y porque acompañado de texto el color no es lo que carga el dato.
 */
export default function EvolucionPage() {
  const { brandName } = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const [stats, setStats] = useState<EvolutionStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getEvolutionStats().then(
      (data) => {
        if (!cancelled) setStats(data);
      },
      () => {
        if (!cancelled) setError("No se pudieron cargar las estadísticas.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="evolucion" planLabel={brandName} />
      <div className="flex justify-start px-4 pb-2 desktop:px-8">
        <Link
          href="/"
          className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al panel
        </Link>
      </div>
      <div className="h-px shrink-0 bg-line" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 desktop:px-8">
        <div>
          <div className="text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
          <h1 className="text-2xl font-bold">Evolución</h1>
          <p className="mt-1 text-sm text-tx-2">
            Dos cosas distintas: lo que produjiste y lo que Instagram hizo con eso.
          </p>
        </div>

        {/* Producción se deriva sola de las propuestas; Instagram es una
            captura manual de una ventana cerrada. Van en bloques separados
            justamente porque no se actualizan al mismo ritmo. */}
        <div>
          <h2 className="text-xl font-bold">Producción</h2>
          <p className="mt-0.5 text-sm text-tx-2">
            Cuánto se cargó, qué se aprobó y qué está esperando respuesta.
          </p>
        </div>

        {error && <p className="text-sm text-[var(--color-brand-red-text)]">{error}</p>}

        {!stats && !error && <p className="text-sm text-tx-3">Cargando…</p>}

        {stats && stats.total === 0 && (
          <p className="text-sm text-tx-3">
            Todavía no hay propuestas cargadas. Acá van a aparecer los números en cuanto las haya.
          </p>
        )}

        {stats && stats.total > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
              <StatTile
                label="Propuestas"
                value={stats.total}
                nota={describirMes(stats.esteMes, stats.mesAnterior)}
              />
              <StatTile
                label="Aprobadas"
                value={stats.aprobadas}
                nota={`${porcentaje(stats.aprobadas, stats.total)} del total`}
              />
              <StatTile
                label="Esperando respuesta"
                value={stats.esperando}
                nota={stats.esperando === 0 ? "Nada pendiente" : "Sin la aprobación de Jun"}
              />
              <StatTile
                label="Comentarios sin resolver"
                value={stats.comentariosSinResolver}
                nota={stats.comentariosSinResolver === 0 ? "Todo resuelto" : "Pedidos de cambio abiertos"}
              />
            </div>

            <Card
              title="Propuestas por mes"
              description="Los últimos 12 meses. La parte llena es lo que quedó aprobado."
            >
              <MonthlyBars puntos={stats.porMes} />
            </Card>

            <div className="grid gap-5 desktop:grid-cols-2">
              <Card title="Estado actual" description="En qué punto está cada propuesta cargada.">
                <StatusBreakdown tajadas={stats.porEstado} total={stats.total} />
              </Card>

              <Card title="Por formato" description="Qué se produce más.">
                <RankedBars tajadas={stats.porFormato} total={stats.total} />
              </Card>
            </div>

            <Card title="Por pilar de contenido" description="Cómo se reparte el plan entre los pilares.">
              <RankedBars tajadas={stats.porPilar} total={stats.total} />
            </Card>
          </>
        )}

        <InstagramBlock canEdit={canEdit} />
      </div>
    </div>
  );
}

function porcentaje(parte: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

/** El encabezado del total compara con el mes pasado, que es la lectura que
 * de verdad se busca al abrir esto. Sin mes anterior no inventa una
 * variación: dice el dato y ya. */
function describirMes(esteMes: number, mesAnterior: number): string {
  if (esteMes === 0 && mesAnterior === 0) return "Ninguna este mes";
  if (mesAnterior === 0) return `${esteMes} este mes`;
  const delta = esteMes - mesAnterior;
  if (delta === 0) return `${esteMes} este mes, igual que el anterior`;
  return `${esteMes} este mes (${delta > 0 ? "+" : ""}${delta} vs. el anterior)`;
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line-2 bg-panel-2 p-4 desktop:p-5">
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mt-0.5 text-[12px] text-tx-3">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Un número grande y su contexto. No lleva gráfico: para un solo valor, la
 * cifra ES la visualización — una barra sola no compara con nada. */
function StatTile({ label, value, nota }: { label: string; value: number; nota: string }) {
  return (
    <div className="rounded-lg border border-line-2 bg-panel-2 p-4">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">{label}</div>
      {/* tabular-nums: sin esto, los cuatro números de la fila bailan de
          ancho entre una carga y la otra según qué dígitos toquen. */}
      <div className="mt-1 text-3xl leading-none font-bold tabular-nums">{value}</div>
      <div className="mt-2 text-[11px] leading-snug text-tx-3">{nota}</div>
    </div>
  );
}

/** Barras por mes, apiladas en dos partes: lo aprobado (lleno) sobre el
 * total (tenue). Barras y no una línea porque cada mes es un balde cerrado,
 * no una medición continua — una curva entre agosto y septiembre insinuaría
 * valores intermedios que no existen. */
function MonthlyBars({ puntos }: { puntos: { mes: string; etiqueta: string; propuestas: number; aprobadas: number }[] }) {
  const max = Math.max(1, ...puntos.map((p) => p.propuestas));

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 140 }}>
        {puntos.map((p) => {
          const alto = (p.propuestas / max) * 100;
          const altoAprobadas = p.propuestas > 0 ? (p.aprobadas / p.propuestas) * 100 : 0;
          return (
            <div key={p.mes} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
              {/* El título nativo alcanza como capa de detalle acá: son doce
                  barras con dos números cada una, y un tooltip propio sería
                  más código del que ahorra. */}
              <div
                className="relative w-full rounded-t-[4px] bg-[var(--line-soft)] transition-colors duration-[200ms] group-hover:bg-[var(--line)]"
                style={{ height: `${Math.max(alto, p.propuestas > 0 ? 3 : 0)}%` }}
                title={`${p.etiqueta}: ${p.propuestas} propuesta${p.propuestas === 1 ? "" : "s"}, ${p.aprobadas} aprobada${p.aprobadas === 1 ? "" : "s"}`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-brand-blue"
                  style={{ height: `${altoAprobadas}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {puntos.map((p) => (
          <div key={p.mes} className="min-w-0 flex-1 text-center text-[10px] text-tx-3">
            {p.etiqueta}
          </div>
        ))}
      </div>

      {/* Dos series, dos etiquetas: con la leyenda, el relleno no depende de
          que alguien distinga dos azules. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tx-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-brand-blue" />
          Aprobadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--line)]" />
          Cargadas sin aprobar
        </span>
      </div>
    </div>
  );
}

/** Una sola barra repartida entre los cuatro estados, con la lista debajo.
 * La lista no es decoración: es la que dice cuál es cuál, y la que hace que
 * el gráfico se pueda leer sin distinguir los colores. */
function StatusBreakdown({ tajadas, total }: { tajadas: Tajada[]; total: number }) {
  const visibles = tajadas.filter((t) => t.cantidad > 0);
  return (
    <div>
      {/* gap-[2px]: el corte entre dos tramos tiene que ser del fondo, no del
          borde de al lado — dos colores pegados se leen como uno degradado. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {visibles.map((t) => {
          const estilo = statusPillStyle(t.nombre as ProposalStatus);
          return (
            <div
              key={t.nombre}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(t.cantidad / total) * 100}%`, backgroundColor: estilo.color }}
              title={`${t.nombre}: ${t.cantidad}`}
            />
          );
        })}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {tajadas.map((t) => {
          const estilo = statusPillStyle(t.nombre as ProposalStatus);
          return (
            <li key={t.nombre} className="flex items-center gap-2 text-[13px]">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: estilo.color }}
              />
              <span className="min-w-0 flex-1 truncate text-tx-2">{t.nombre}</span>
              <span className="shrink-0 tabular-nums text-brand-ink">{t.cantidad}</span>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-tx-3">
                {porcentaje(t.cantidad, total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barras horizontales con el nombre al lado. Horizontales porque las
 * etiquetas son texto ("Post simple", un pilar entero): en vertical habría
 * que rotarlas o abreviarlas, y ninguna de las dos se lee. */
function RankedBars({ tajadas, total }: { tajadas: Tajada[]; total: number }) {
  const max = Math.max(1, ...tajadas.map((t) => t.cantidad));
  return (
    <ul className="flex flex-col gap-3">
      {tajadas.map((t) => (
        <li key={t.nombre}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate text-tx-2">{t.nombre}</span>
            <span className="shrink-0 tabular-nums">
              {t.cantidad}
              <span className="ml-1.5 text-[11px] text-tx-3">{porcentaje(t.cantidad, total)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--line-soft)]">
            <div
              className="h-full rounded-full bg-brand-blue"
              style={{ width: `${(t.cantidad / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
