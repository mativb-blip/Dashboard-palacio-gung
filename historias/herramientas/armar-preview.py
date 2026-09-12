#!/usr/bin/env python3
"""Arma UNA hoja autónoma para comparar las tres animaciones.

    python3 herramientas/armar-preview.py

Mete adentro el CSS, las tipografías, GSAP, la foto y las tres líneas de
tiempo, así el archivo abre en cualquier navegador sin servidor y sin red.
Pesa unos 2.5 MB, casi todo la foto.

El lienzo se mantiene en 1080x1920 reales y se escala con transform, en
vez de re-maquetar en unidades relativas: así lo que se ve es exactamente
la misma geometría que va a salir del render, sin diferencias de redondeo.
"""
import base64, pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def b64(p):
    return base64.b64encode((RAIZ / p).read_bytes()).decode()


def css_con_fuentes():
    css = (RAIZ / "assets/pieza.css").read_text()
    # las url() de @font-face son relativas al CSS; acá las incrustamos
    for nombre, ruta in [("fonts/montserrat-var.woff2", "assets/fonts/montserrat-var.woff2"),
                         ("fonts/montserrat-var-italic.woff2", "assets/fonts/montserrat-var-italic.woff2"),
                         ("fonts/notosanskr-subset.woff2", "assets/fonts/notosanskr-subset.woff2")]:
        css = css.replace(f'url("{nombre}")', f'url(data:font/woff2;base64,{b64(ruta)})')
    return css + "\n" + (RAIZ / "assets/animacion.css").read_text()


VERSIONES = [
    ("camara",   "A · Cámara",
     "La foto se acerca 5% en los 5 s; el texto solo aparece y se queda quieto. "
     "El movimiento le pertenece a la foto, que es la protagonista."),
    ("entrada",  "B · Entrada escalonada",
     "Foto fija. El texto llega en tres tiempos —nombre, hangul, bajada— subiendo "
     "14 px. Tiene que llegar, no actuar."),
    ("revelado", "C · Revelado por línea",
     "Cada línea sube desde detrás de su máscara, escalonadas. La más diseñada, y "
     "por eso la más riesgosa: le devuelve el protagonismo a la tipografía."),
    ("scramble", "D · Scramble",
     "Cada línea se revuelve y se resuelve. El hangul usa sílabas coreanas reales de "
     "la fuente; la bajada, un pool acotado para que la línea no desborde al revolver."),
]

marca = re.search(r'<div id="bloque".*?</div>\n      </div>',
                  (RAIZ / "piezas/animacion/b-entrada.html").read_text(), re.S).group(0)

botones = "\n".join(
    f'      <button data-v="{k}">{t.split(" · ")[0]}</button>' for k, t, _ in VERSIONES)
fichas = "\n".join(
    f'      <p data-v="{k}"><b>{t}</b><br>{d}</p>' for k, t, d in VERSIONES)

html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Palacio Gung — tres animaciones</title>
<style>
{css_con_fuentes()}

/* ---- sólo de la hoja de comparación, no del sistema ---- */
html, body {{ width: auto; height: 100%; background: #111; overflow: hidden; }}
body {{ display: flex; flex-direction: column; align-items: center;
        font-family: "Montserrat", system-ui, sans-serif; color: #e8e8e8; }}
#marco {{ flex: 1; display: grid; place-items: center; width: 100%; min-height: 0; }}
/* transform: scale() NO reduce el espacio que el elemento ocupa en la
   maqueta, así que el lienzo de 1080x1920 desbordaba. La caja de afuera
   lleva el tamaño ya escalado y la de adentro solo la transformación. */
#caja {{ position: relative; overflow: hidden; }}
#escala {{ width: 1080px; height: 1920px; transform-origin: top left; }}
#root {{ box-shadow: 0 10px 50px rgba(0,0,0,.6); }}
#panel {{ padding: 14px 20px 20px; text-align: center; max-width: 620px; }}
#botones {{ display: flex; gap: 8px; justify-content: center; margin-bottom: 10px; }}
button {{ font: 600 12.5px/1 "Montserrat", sans-serif; color: #ddd; background: #222;
          border: 1px solid #3a3a3a; border-radius: 3px; padding: 9px 15px; cursor: pointer; }}
button:hover {{ background: #2c2c2c; }}
button[aria-pressed="true"] {{ background: #e8e8e8; color: #111; border-color: #e8e8e8; }}
#panel p {{ display: none; font-size: 12.5px; line-height: 1.55; color: #9a9a9a; }}
#panel p.activa {{ display: block; }}
#panel b {{ color: #e8e8e8; font-weight: 600; }}
#reloj {{ font-size: 11px; color: #666; margin-top: 8px; letter-spacing: .08em; }}
</style>
</head>
<body>
  <div id="marco"><div id="caja"><div id="escala">
    <div id="root" style="width:1080px;height:1920px">
      <img id="foto" src="data:image/jpeg;base64,{b64('fotos/mandu-guk-cenital.jpg')}" alt="">
{marca}
    </div>
  </div></div></div>

  <div id="panel">
    <div id="botones">
{botones}
    </div>
{fichas}
    <div id="reloj">0.00 s / 5.00 s · se repite sola</div>
  </div>

<script>{(RAIZ / 'assets/vendor/gsap.min.js').read_text()}</script>
<script>{(RAIZ / 'assets/vendor/ScrambleTextPlugin.min.js').read_text()}</script>
<script>{(RAIZ / 'assets/animaciones.js').read_text()}</script>
<script>
(function () {{
  var actual = null, cual = "camara";
  var reloj = document.getElementById("reloj");

  function escalar() {{
    var m = document.getElementById("marco"), caja = document.getElementById("caja");
    var k = Math.min(m.clientWidth / 1080, m.clientHeight / 1920) * 0.94;
    caja.style.width  = (1080 * k) + "px";
    caja.style.height = (1920 * k) + "px";
    document.getElementById("escala").style.transform = "scale(" + k + ")";
  }}
  // El panel de abajo cambia de alto cuando cargan las fuentes y cuando se
  // cambia de versión, así que no alcanza con escalar una vez al arrancar:
  // hay que reaccionar a que el marco cambie de tamaño.
  addEventListener("resize", escalar);
  new ResizeObserver(escalar).observe(document.getElementById("marco"));
  escalar();

  function poner(v) {{
    if (actual) {{ actual.kill(); }}
    // limpiar lo que dejó la versión anterior
    gsap.set(["#foto", "#bloque", "#n", "#h", "#b", ".linea"],
             {{ clearProps: "all" }});
    // clearProps no toca el texto, y el scramble deja el DOM revuelto si se
    // cambia de versión a mitad de camino. Hay que devolverlo a mano.
    document.querySelectorAll(".linea").forEach(function (el) {{
      if (!el.dataset.final) {{ el.dataset.final = el.textContent; }}
      el.textContent = el.dataset.final;
    }});
    cual = v;
    actual = window.ANIMACIONES[v]();
    actual.repeat(-1).repeatDelay(0.9).play(0);
    document.querySelectorAll("#botones button").forEach(function (b) {{
      b.setAttribute("aria-pressed", b.dataset.v === v);
    }});
    document.querySelectorAll("#panel p").forEach(function (p) {{
      p.classList.toggle("activa", p.dataset.v === v);
    }});
    escalar();
  }}

  document.querySelectorAll("#botones button").forEach(function (b) {{
    b.addEventListener("click", function () {{ poner(b.dataset.v); }});
  }});

  gsap.ticker.add(function () {{
    if (actual) reloj.textContent = actual.time().toFixed(2) + " s / 5.00 s · se repite sola";
  }});

  // Gancho de verificación: abrir con #v=revelado&t=1.6 congela esa versión
  // en ese segundo en vez de reproducirla. Sirve para comparar un instante
  // exacto entre las tres, y para capturarlas sin depender del reloj.
  var h = new URLSearchParams(location.hash.slice(1));
  document.fonts.ready.then(function () {{
    poner(h.get("v") || "camara");
    if (h.has("t")) {{ actual.repeat(0).pause(parseFloat(h.get("t"))); }}
  }});
}})();
</script>
</body>
</html>
"""
salida = RAIZ / "piezas/animacion/comparar.html"
salida.write_text(html)
print(f"{salida.relative_to(RAIZ)}: {salida.stat().st_size/1e6:.2f} MB")
