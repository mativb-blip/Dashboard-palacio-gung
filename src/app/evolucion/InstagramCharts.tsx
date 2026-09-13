"use client";

/**
 * Los gráficos del bloque de Instagram.
 *
 * TODO SE DIBUJA A ESCALA. Cada figura declara su escala arriba y todas las
 * posiciones salen de ella — nada se acomoda a ojo. Una auditoría de la
 * primera versión encontró tres gráficos mal escalados (el embudo con el
 * polígono cruzado, dos de tres burbujas fuera de su coordenada y la barra
 * de género dibujando 81,4 % donde el dato decía 78,7 %). Un gráfico que
 * miente es peor que una tabla.
 *
 * UN SOLO COLOR PARA LAS MAGNITUDES: el azul de marca. El rojo aparece
 * únicamente donde hay pérdida o un camino cortado; nunca como "otra serie".
 */

const LOCALE = "es-ES";
export const num = (v: number) => Math.round(v).toLocaleString(LOCALE, { useGrouping: "always" });
export const dec = (v: number, d = 2) =>
  v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
export const porc = (v: number, d = 2) => `${dec(v, d)} %`;

/** Curva de seguidores activos por hora, con la franja recomendada marcada.
 * Va primero en la pantalla porque es lo único de la medición sobre lo que se
 * puede actuar mañana: se compara contra el calendario. */
export function ClockChart({
  desde,
  hasta,
  publicaciones,
}: {
  desde: number;
  hasta: number;
  /** Horas (0-23) en que hay propuestas programadas dentro del período. */
  publicaciones: number[];
}) {
  // Curva del panel de Instagram: anclas declaradas (0 h ~8 mil, mínimo a
  // las 3, meseta al mediodía, pico 22 mil a las 18, descenso hasta
  // medianoche) interpoladas hora por hora. Es aproximada y la leyenda lo dice.
  const V = [8, 6.5, 5.5, 5, 5.5, 7, 10, 13, 16, 18.5, 19.5, 20, 21, 20.5, 19.5, 20, 20.5, 21.3, 22, 21.5, 20, 18, 14, 10.5];
  const MAX = 24;

  // Escala única: x por hora, y por miles de seguidores.
  const X0 = 46, X1 = 706, Y0 = 156, Y1 = 30;
  const x = (h: number) => X0 + (h / 23) * (X1 - X0);
  const y = (v: number) => Y0 - (v / MAX) * (Y0 - Y1);

  const puntos = V.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
  const pico = V.indexOf(Math.max(...V));

  return (
    <svg viewBox="0 0 730 205" role="img" aria-label={`Seguidores activos por hora. Pico de 22 mil a las ${pico} horas; la franja recomendada va de ${desde} a ${hasta}.`}>
      <g stroke="var(--line-soft)" strokeWidth="1">
        {[0, 8, 16, 24].map((v) => (
          <line key={v} x1={X0} y1={y(v)} x2={X1} y2={y(v)} />
        ))}
      </g>
      <g fill="var(--muted)" fontSize="10" textAnchor="end">
        {[0, 8, 16, 24].map((v) => (
          <text key={v} x={X0 - 8} y={y(v) + 3.5}>{v === 0 ? "0" : `${v} mil`}</text>
        ))}
      </g>

      <rect x={x(desde)} y={Y1 - 6} width={x(hasta) - x(desde)} height={Y0 - Y1 + 6} fill="var(--accent-dim)" />
      <line x1={x(desde)} y1={Y1 - 6} x2={x(desde)} y2={Y0} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={x(hasta)} y1={Y1 - 6} x2={x(hasta)} y2={Y0} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={(x(desde) + x(hasta)) / 2} y={Y1 - 11} textAnchor="middle" fontSize="10" fill="var(--accent)">
        franja recomendada
      </text>

      <path d={`M${puntos} L${x(23)},${Y0} L${x(0)},${Y0} Z`} fill="var(--accent-dim)" />
      <path d={`M${puntos}`} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pico)} cy={y(V[pico])} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />

      {/* Las publicaciones del período, sobre el eje. Dentro de la franja van
          en azul; fuera, en tinta, para que se cuenten de un vistazo. */}
      {publicaciones.map((h, i) => (
        <circle
          key={`${h}-${i}`}
          cx={x(h)}
          cy={Y0 + 16}
          r="3.4"
          fill={h >= desde && h < hasta ? "var(--accent)" : "var(--ink)"}
        />
      ))}

      <g fill="var(--muted)" fontSize="10" textAnchor="middle">
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={Y0 + 38}>{h} h</text>
        ))}
      </g>
    </svg>
  );
}

/** Embudo proporcional de tres pasos. El ancho de cada tramo es su valor
 * sobre el primero, así la caída ES la forma. Termina contra la pared roja
 * del enlace de la bio cuando ese canal está en cero. */
export function FunnelChart({
  viewers,
  profileVisits,
  follows,
  bioLinkTaps,
  visitRatePct,
  followRatePct,
}: {
  viewers: number;
  profileVisits: number;
  follows: number;
  bioLinkTaps: number;
  visitRatePct: number;
  followRatePct: number;
}) {
  const CX = 150, MEDIA = 130, TOP = 22, MID = 116, BOT = 190;
  // Semiancho proporcional en cada parada. Piso de 2px: por debajo de eso el
  // trazo desaparece y el embudo parecería terminar en cero, que no es el dato.
  const semi = (v: number) => Math.max((v / viewers) * MEDIA, 2);
  const m = semi(profileVisits);
  const b = semi(follows);

  return (
    <svg viewBox="0 0 300 250" role="img" aria-label={`De ${num(viewers)} que vieron algo, ${num(profileVisits)} entraron al perfil y ${num(follows)} se hicieron seguidores.`}>
      <path
        d={`M${CX - MEDIA},${TOP} L${CX + MEDIA},${TOP} L${CX + m},${MID} L${CX + b},${BOT} L${CX - b},${BOT} L${CX - m},${MID} Z`}
        fill="var(--accent-dim)"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <g>
        <text x="20" y="52" className="fig" fontSize="24">{num(viewers)}</text>
        <text x="20" y="68" fontSize="11" fill="var(--muted)">vieron algo</text>
      </g>
      <g>
        <text x="20" y="140" className="fig" fontSize="20">{num(profileVisits)}</text>
        <text x="20" y="156" fontSize="11" fill="var(--muted)">entraron al perfil</text>
        <text x="280" y="140" fontSize="10" textAnchor="end" fill="var(--accent)">{porc(visitRatePct)}</text>
      </g>
      <g>
        <text x="20" y="208" className="fig" fontSize="20">{num(follows)}</text>
        <text x="20" y="224" fontSize="11" fill="var(--muted)">se hicieron seguidores</text>
        <text x="280" y="208" fontSize="10" textAnchor="end" fill="var(--accent)">{porc(followRatePct)}</text>
      </g>

      {bioLinkTaps === 0 && (
        <>
          <line x1="20" y1="242" x2="280" y2="242" stroke="var(--rojo)" strokeWidth="2" />
          <text x="20" y="237" fontSize="10" fill="var(--rojo)">0 toques en el enlace de la bio</text>
        </>
      )}
    </svg>
  );
}

/** Alcance contra rendimiento. Cada formato es una burbuja: posición
 * horizontal el alcance, vertical la interacción por espectador, área las
 * interacciones totales. Una sola imagen dice lo que dos columnas de barras
 * obligan a deducir. */
export function BubbleChart({
  formatos,
}: {
  formatos: { nombre: string; alcance: number; eficiencia: number; interacciones: number }[];
}) {
  const X0 = 48, X1 = 300, Y0 = 182, Y1 = 28;
  const maxX = Math.max(30000, ...formatos.map((f) => f.alcance));
  const maxY = Math.max(6, ...formatos.map((f) => f.eficiencia));
  const x = (v: number) => X0 + (v / maxX) * (X1 - X0);
  const y = (v: number) => Y0 - (v / maxY) * (Y0 - Y1);
  // Área proporcional a las interacciones, no el radio: si el radio fuera
  // proporcional, un formato con el doble se vería cuatro veces más grande.
  const maxI = Math.max(1, ...formatos.map((f) => f.interacciones));
  const r = (v: number) => 6 + Math.sqrt(v / maxI) * 24;

  const ticksX = [0, 10000, 20000, 30000].filter((t) => t <= maxX);
  const ticksY = [0, 2, 4, 6].filter((t) => t <= maxY);

  return (
    <svg viewBox="0 0 320 250" role="img" aria-label={formatos.map((f) => `${f.nombre}: ${num(f.alcance)} espectadores, ${porc(f.eficiencia)} de interacción`).join(". ")}>
      <g stroke="var(--line-soft)" strokeWidth="1">
        {ticksY.map((t) => (
          <line key={t} x1={X0} y1={y(t)} x2={X1} y2={y(t)} />
        ))}
      </g>
      <g fill="var(--muted)" fontSize="10" textAnchor="end">
        {ticksY.map((t) => (
          <text key={t} x={X0 - 8} y={y(t) + 3.5}>{t === 0 ? "0" : `${t} %`}</text>
        ))}
      </g>

      {formatos.map((f) => {
        const cx = x(f.alcance);
        const cy = y(f.eficiencia);
        const rad = r(f.interacciones);
        const grande = rad >= 18;
        return (
          <g key={f.nombre}>
            <circle cx={cx} cy={cy} r={rad} fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="1.5" />
            {grande && (
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" className="fig">
                {porc(f.eficiencia, 1)}
              </text>
            )}
            <text
              x={cx}
              y={cy - rad - 7}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {f.nombre}
            </text>
            {!grande && (
              <text x={cx} y={cy - rad - 19} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {porc(f.eficiencia, 1)}
              </text>
            )}
          </g>
        );
      })}

      <g fill="var(--muted)" fontSize="10" textAnchor="middle">
        {ticksX.map((t) => (
          <text key={t} x={x(t)} y={Y0 + 20}>{t === 0 ? "0" : `${t / 1000} mil`}</text>
        ))}
        <text x={(X0 + X1) / 2} y={Y0 + 40}>espectadores alcanzados</text>
      </g>
      <text x="14" y={(Y0 + Y1) / 2} textAnchor="middle" fontSize="10" fill="var(--muted)" transform={`rotate(-90 14 ${(Y0 + Y1) / 2})`}>
        interacción por espectador
      </text>
    </svg>
  );
}

/** Anillo de penetración: qué parte de la base propia vio algo. Un anillo y
 * no una barra porque es un solo valor sobre su total, y acá la cifra del
 * centro es el contenido. */
export function RingChart({ pct, vieron, base }: { pct: number; vieron: number; base: number }) {
  const R = 66;
  const circunferencia = 2 * Math.PI * R;
  const llenado = (Math.min(pct, 100) / 100) * circunferencia;

  return (
    <svg viewBox="0 0 220 205" role="img" aria-label={`${porc(pct)} de la base propia vio contenido: ${num(vieron)} de ${num(base)} seguidores.`}>
      <circle cx="110" cy="96" r={R} fill="none" stroke="var(--line)" strokeWidth="15" />
      <circle
        cx="110"
        cy="96"
        r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="15"
        strokeDasharray={`${llenado.toFixed(1)} ${(circunferencia - llenado).toFixed(1)}`}
        transform="rotate(-90 110 96)"
      />
      <text x="110" y="98" textAnchor="middle" className="fig" fontSize="32">{dec(pct)}</text>
      <text x="110" y="116" textAnchor="middle" fontSize="10" fill="var(--muted)">por ciento</text>
      <text x="110" y="192" textAnchor="middle" fontSize="11" fill="var(--muted)">
        {num(vieron)} de {num(base)} seguidores
      </text>
    </svg>
  );
}

/** Altas, bajas y saldo. Las tres barras comparten la misma escala (el total
 * de altas), así el pedazo que se va se lee contra lo que entró. */
export function ChurnChart({ follows, unfollows, net }: { follows: number; unfollows: number; net: number }) {
  const X0 = 20, ANCHO = 330;
  const w = (v: number) => (v / Math.max(1, follows)) * ANCHO;

  return (
    <svg viewBox="0 0 520 150" role="img" aria-label={`${num(follows)} altas, ${num(unfollows)} bajas, saldo de ${num(net)}.`}>
      <rect x={X0} y="24" width={w(follows)} height="26" rx="3" fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="1" />
      <text x={X0 + 10} y="43" className="fig" fontSize="16">{num(follows)}</text>
      <text x={X0 + w(follows) + 12} y="42" fontSize="11" fill="var(--muted)">empezaron a seguirte</text>

      <rect x={X0} y="62" width={w(unfollows)} height="26" rx="3" fill="var(--rojo-dim)" stroke="var(--rojo)" strokeWidth="1" />
      <text x={X0 + 10} y="81" className="fig" fontSize="16" fill="var(--rojo)">{num(unfollows)}</text>
      <text x={X0 + w(unfollows) + 12} y="80" fontSize="11" fill="var(--muted)">dejaron de seguirte</text>

      <line x1={X0} y1="102" x2="500" y2="102" stroke="var(--line)" strokeWidth="1" />
      <rect x={X0} y="110" width={w(Math.max(net, 0))} height="26" rx="3" fill="var(--accent)" />
      <text x={X0 + 10} y="129" className="fig" fontSize="16" fill="var(--ground)">
        {net >= 0 ? "+" : ""}{num(net)}
      </text>
      <text x={X0 + w(Math.max(net, 0)) + 12} y="128" fontSize="11" fill="var(--muted)">quedaron</text>
    </svg>
  );
}

/** Dos barras partidas: quién ve y quién responde. La comparación entre las
 * dos filas es el dato — la cuenta alcanza extraños y su propia gente
 * responde más. */
export function AudienceSplit({ vistaPct, interaccionPct }: { vistaPct: number; interaccionPct: number }) {
  const X0 = 20, ANCHO = 480, GAP = 4;
  const filas = [
    { etiqueta: "De quienes vieron algo", pct: vistaPct, y: 28 },
    { etiqueta: "De quienes interactuaron", pct: interaccionPct, y: 90 },
  ];
  return (
    <svg viewBox="0 0 520 130" role="img" aria-label={`${porc(vistaPct, 1)} de quienes vieron algo te seguían; ${porc(interaccionPct, 1)} de quienes interactuaron.`}>
      {filas.map((f) => {
        const wSeg = (f.pct / 100) * ANCHO;
        return (
          <g key={f.etiqueta}>
            <text x={X0} y={f.y - 8} fontSize="11" fill="var(--muted)">{f.etiqueta}</text>
            <rect x={X0} y={f.y} width={wSeg} height="20" rx="3" fill="var(--accent)" />
            <rect x={X0 + wSeg + GAP} y={f.y} width={ANCHO - wSeg - GAP} height="20" rx="3" fill="var(--line)" />
            <text x={X0 + 8} y={f.y + 14} fontSize="10" fill="var(--ground)">{porc(f.pct, 1)}</text>
            <text x={X0 + wSeg + GAP + 8} y={f.y + 14} fontSize="10" fill="var(--muted)">
              {porc(100 - f.pct, 1)} no te seguían
            </text>
          </g>
        );
      })}
    </svg>
  );
}
