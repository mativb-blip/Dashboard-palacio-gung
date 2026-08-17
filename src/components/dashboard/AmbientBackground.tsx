/** Fondo de la app: negro con luz difusa neutra y grano.
 *
 * Es lo que dejan ver las superficies de vidrio del dashboard — sin algo con
 * variación detrás, una superficie translúcida sobre negro plano se ve igual
 * que una opaca.
 *
 * Achromático a propósito: la luz es blanca a muy baja opacidad, sin tinte de
 * marca. Un fondo teñido le compite el color a las fotos y los reels, que son
 * el contenido real del tablero, y además vuelve sucio cualquier arte con
 * dominante cálida. El azul de marca queda para los acentos de interfaz.
 *
 * Los halos son divs con `blur` y no radial-gradients: la caída es mucho más
 * suave y no aparece el bandeado que sí se nota en un degradado grande.
 * Encima va un barrido diagonal, que es lo que da el aire satinado, y grano
 * fino para romper el bandeado que queda.
 */
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050506]" aria-hidden>
      {/* Foco principal, a media altura sobre la derecha. */}
      <div className="absolute top-[22%] -right-[12%] h-[70%] w-[62%] rounded-full bg-white/[0.09] blur-[130px]" />
      {/* Contraluz bajo, hacia el centro-izquierda: separa el pie del encuadre. */}
      <div className="absolute -bottom-[22%] left-[8%] h-[55%] w-[65%] rounded-full bg-white/[0.055] blur-[130px]" />
      {/* Insinuación arriba a la izquierda, para que la esquina no quede muerta. */}
      <div className="absolute -top-[18%] -left-[10%] h-[45%] w-[45%] rounded-full bg-white/[0.03] blur-[120px]" />

      {/* Barrido diagonal: la banda de luz satinada de la referencia. Muy
          tenue — se nota como material, no como una franja. */}
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.05)_38%,transparent_58%)]" />

      {/* Viñeta: cierra los bordes y empuja la mirada al centro. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />

      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
