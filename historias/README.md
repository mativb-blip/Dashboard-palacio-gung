# Historias — Palacio Gung

Historia vertical 9:16 para Instagram, **solo tipografía, sin ninguna imagen de
fondo**. 1080 × 1920 · 30 fps · 5.0 s. Proyecto [HyperFrames](https://hyperframes.heygen.com)
independiente del app de Next.js de la raíz: no comparte dependencias ni build.

## Entregables

| Archivo | Qué es |
|---|---|
| `renders/palacio-gung-open-9x16.mp4` | 1080×1920 · 30 fps · H.264 · yuv420p · 5.0 s |
| `renders/palacio-gung-open-9x16-alpha.webm` | VP9 con canal alfa (`ALPHA_MODE=1`) |
| `renders/palacio-gung-open-9x16-alpha.gif` | 1080×1920 · 15 fps · fondo transparente |

Las dos variantes con alfa son para montar la historia **sobre foto o video**.

> **La tipografía crema casi desaparece sobre fondo claro.** Es una limitación
> conocida de la pieza, no un bug: el `--ink` es `#f4efe6` y está pensado contra el
> fondo oscuro del MP4. Sobre gris medio y negro lee perfecto. Verificado
> componiendo los tres fondos antes de entregar.

## Archivos

```
index.html            composición principal (con fondo)
variants/alpha.html   misma pieza, fondo transparente
assets/story.css      estilos compartidos + @font-face locales
assets/timeline.js    la línea de tiempo GSAP, compartida por los dos HTML
assets/fonts/         Montserrat variable (subconjunto latin), servida local
assets/vendor/        GSAP 3.14.2 vendorizado
```

`index.html` y `variants/alpha.html` comparten CSS y línea de tiempo: la animación
existe **una sola vez**. Lo único que cambia la variante alfa es el fondo y su
`data-composition-id`.

## Reconstruir / re-renderizar

Requiere FFmpeg y el Chrome de render (`sudo apt-get install -y ffmpeg` y
`npx hyperframes browser ensure`; `npx hyperframes doctor` dice qué falta).

```bash
npm install                     # solo gsap, para vendorizarlo

npm run check                   # lint + runtime + layout + motion + contraste
npx hyperframes snapshot --at 0.75,1.4,2.95,3.05,3.15,3.4,4.9

# MP4
npx hyperframes render . -o renders/palacio-gung-open-9x16.mp4 -q high

# WebM con alfa
npx hyperframes render . -c variants/alpha.html --format webm -q high \
  -o renders/palacio-gung-open-9x16-alpha.webm

# GIF transparente: DOS pasos, no --format gif
npx hyperframes render . -c variants/alpha.html --format png-sequence --fps 15 -q high -o /tmp/seq
ffmpeg -y -framerate 15 -i /tmp/seq/frame_%06d.png \
  -vf "palettegen=reserve_transparent=1:max_colors=200:stats_mode=diff" /tmp/palette.png
ffmpeg -y -framerate 15 -i /tmp/seq/frame_%06d.png -i /tmp/palette.png \
  -lavfi "paletteuse=alpha_threshold=96:dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 renders/palacio-gung-open-9x16-alpha.gif
```

Estado limpio de referencia: **0 errores de lint · 0 de runtime · 0 issues de
layout en 9 muestras · 10/10 de contraste WCAG AA**.

## Decisiones que cuesta caro volver a descubrir

1. **GSAP no puede venir por CDN.** `cdn.jsdelivr.net` está bloqueado en el
   contenedor de render: el navegador tira `ERR_TUNNEL_CONNECTION_FAILED` y
   `curl` recibe un 403. Por eso `assets/vendor/gsap.min.js`, copiado del
   `npm i gsap@3.14.2`.

2. **Un `<link>` a Google Fonts rompe `hyperframes check`** con
   `Navigation timeout of 10000 ms exceeded`. Las fuentes se bajaron con la API
   `css2` (mandando un User-Agent de Chrome) y se declaran como `@font-face`
   locales. El subconjunto `latin` cubre `ñ á é í ó ú ¿ ¡` — verificado contra
   el `cmap` de los dos archivos.
   > Google hoy sirve Montserrat como **fuente variable**: los cinco pesos que
   > pide el diseño (500, 600, 800, 300 itálica, 500 itálica) salen de **dos**
   > archivos, no de cinco, declarados con `font-weight: 100 900`. Guardar cinco
   > copias de dos archivos sería 1 MB de bytes repetidos en el repo.

3. **El registro de `window.__timelines` va inline en cada HTML**, aunque la
   línea de tiempo viva en `assets/timeline.js`. El lint la busca **en el
   documento** y un archivo externo no le alcanza (`missing_timeline_registry`).
   Eso importa más de lo que parece: un error de lint **apaga los audits de
   layout y contraste**, y `check` pasa a reportar «0 samples» — que parece
   limpio y significa que no corrió nada.

4. **La variante alfa no puede vivir en la raíz**, por lo mismo: dos HTML con
   `data-composition-id` en la raíz disparan `multiple_root_compositions`. De ahí
   `variants/alpha.html` con rutas a `../assets/`.

5. **El microtexto de arriba a la derecha no es copy, es textura** (la frase
   repetida 9 veces al 24 % de opacidad efectiva — `--muted` 0.44 × autoAlpha
   0.55). Reprueba el audit de contraste con 3.95:1 y tiene razón: nadie tiene
   que poder leerla. Va marcado con `data-layout-ignore` y `aria-hidden="true"`,
   que es el opt-out que el audit honra.

6. **`--format png-sequence` fuerza la ruta con alfa** y descarta el relleno del
   root. Si verificás el fondo por png-sequence vas a ver transparente y creer
   que el CSS falla. **El fondo se verifica por MP4.**

7. **El relevo entre bloques es seco a propósito.** Con el factor de velocidad
   `S = 1.8`, el bloque A termina de salir en 3.04 s y el B entra en 3.06 s. Si
   se cruzan, los dos textos se superponen y quedan ilegibles — el audit de
   layout lo marca como `content_overlap`. No los cruces.

8. **`S` es la única perilla de ritmo.** Todos los tiempos y duraciones de
   `assets/timeline.js` pasan por `t()`/`d()`, así que retunear la pieza entera
   es cambiar esa constante; los números literales son los originales sin escalar.

9. **El `margin-right: .06em` de `.em` no es decorativo.** Sin él, la itálica
   (`open`, `pedir`) se pega a lo que sigue en el pico del pulso de escala.

## Pendientes

- La pieza **no lleva horario, dirección, teléfono ni @usuario**. Hay espacio
  libre entre la línea dorada de cierre y el borde inferior si hay que meterlos.
- El sistema visual real de la marca (referencia: un post de *Mandu Guk*) es
  **photo-led**: foto protagonista, texto chico en bandera derecha alojado en un
  vacío de la propia foto, un solo color, título al 4.3 % del ancho. Esta pieza
  es lo contrario — *type-led*, titular al 13.2 %. Fue decisión explícita del
  cliente («sin imagen de fondo, solo el texto»), no un descuido.
