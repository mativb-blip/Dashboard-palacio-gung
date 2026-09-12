#!/usr/bin/env python3
"""Dónde puede ir el texto en una foto, y de qué color.

    python3 herramientas/espacio-negativo.py fotos/mi-foto.jpg

Busca las zonas sin detalle (espacio neutro) y para cada una informa la
luminancia y el contraste contra tinta blanca y oscura. El bloque de texto
se ancla a un borde, así que además de la zona neutra más grande reporta
las cuatro esquinas por separado: es lo que decide --ancla y --arriba.

"Neutra" = poca variación local. No alcanza con que sea oscura: la madera
es oscura y tiene veta, y texto chico sobre veta no se lee.
"""
import sys
import numpy as np
from PIL import Image

CELDA = 10          # px por celda de la grilla
UMBRAL = 0.010      # variación local por debajo de la cual la zona es neutra


def mapas(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    a = np.asarray(im, dtype=np.float32) / 255.0
    # luminancia relativa: sRGB -> lineal -> Y (la misma que usa WCAG)
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    Y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
    gh, gw = H // CELDA, W // CELDA
    c = Y[:gh * CELDA, :gw * CELDA].reshape(gh, CELDA, gw, CELDA)
    media = c.mean(axis=(1, 3))
    detalle = c.std(axis=(1, 3))
    # sumar la variación ENTRE celdas vecinas: capta la veta de la madera,
    # que dentro de una celda de 10px puede parecer lisa
    dv = np.zeros_like(detalle)
    dv[:-1, :] += np.abs(media[1:, :] - media[:-1, :])
    dv[:, :-1] += np.abs(media[:, 1:] - media[:, :-1])
    return W, H, media, detalle + dv


def rect_max(ok):
    """Rectángulo de área máxima dentro de la máscara booleana."""
    gh, gw = ok.shape
    alt = np.zeros(gw, dtype=int)
    mejor = (0, 0, 0, 0, 0)
    for y in range(gh):
        alt = np.where(ok[y], alt + 1, 0)
        pila = []
        for x in range(gw + 1):
            h = alt[x] if x < gw else 0
            inicio = x
            while pila and pila[-1][1] >= h:
                x0, h0 = pila.pop()
                if h0 * (x - x0) > mejor[0]:
                    mejor = (h0 * (x - x0), x0, y - h0 + 1, x - x0, h0)
                inicio = x0
            pila.append((inicio, h))
    return mejor


def contraste(Ya, Yb):
    return (max(Ya, Yb) + 0.05) / (min(Ya, Yb) + 0.05)


Y_BLANCO, Y_OSCURA = 1.0, 0.0103   # #ffffff y #1a1a1a


def describir(nombre, media, detalle, gx, gy, gw, gh, W, H):
    if gw == 0 or gh == 0:
        print(f"  {nombre:<16} sin zona neutra")
        return
    parche = media[gy:gy + gh, gx:gx + gw]
    Ym = float(parche.mean())
    x, y, w, h = gx * CELDA, gy * CELDA, gw * CELDA, gh * CELDA
    cb, co = contraste(Y_BLANCO, Ym), contraste(Y_OSCURA, Ym)
    tinta = "#ffffff" if cb >= co else "#1a1a1a"
    print(f"  {nombre:<16} x {x:>4}-{x+w:<4} y {y:>4}-{y+h:<4}  "
          f"({100*w/W:>4.0f}% x {100*h/H:>4.0f}%)  "
          f"lum {Ym:.4f}  blanco {cb:5.2f}:1  oscura {co:5.2f}:1  -> {tinta}")


def main(path):
    W, H, media, detalle = mapas(path)
    ok = detalle < UMBRAL
    gh, gw = ok.shape
    print(f"{path}   {W}x{H}\n")
    print("ZONA NEUTRA MÁS GRANDE")
    area, gx, gy, gwr, ghr = rect_max(ok)
    describir("mayor", media, detalle, gx, gy, gwr, ghr, W, H)
    print(f"  cubre {100*area*CELDA*CELDA/(W*H):.1f} % del lienzo\n")

    print("POR ESQUINA (el bloque se ancla a un borde, así que esto es lo que manda)")
    mitad_v, mitad_h = gh // 2, gw // 2
    for nombre, ys, xs in [("sup. izquierda", slice(0, mitad_v), slice(0, mitad_h)),
                           ("sup. derecha",   slice(0, mitad_v), slice(mitad_h, gw)),
                           ("inf. izquierda", slice(mitad_v, gh), slice(0, mitad_h)),
                           ("inf. derecha",   slice(mitad_v, gh), slice(mitad_h, gw))]:
        sub = ok[ys, xs]
        a2, x2, y2, w2, h2 = rect_max(sub)
        describir(nombre, media, detalle,
                  x2 + (xs.start or 0), y2 + (ys.start or 0), w2, h2, W, H)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        main(p)
        print()
