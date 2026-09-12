#!/usr/bin/env python3
"""Mide un render contra los valores de la referencia y avisa si el texto pisa algo.

    python3 herramientas/verificar.py fotos/mi-foto.jpg render.png

Aísla el texto restando el render contra su foto de fondo, así que mide la
tinta real y no lo que dice el CSS. Informa:

  - altura de tinta de cada nivel, contra los valores de la referencia
  - geometría del bloque (ancla, margen, arranque, medida, interlineado)
  - cuántas bandas de texto hay: si son más de las esperadas, alguna línea
    se partió sola, que es un bug silencioso y fácil de no ver
  - el aire hasta el primer detalle de la foto, o si lo interseca

Valores de la referencia (1449x2576 normalizada a 1080x1920):
  nombre 32 px de tinta · hangul 32 · bajada 20
  margen 14.2 % · arranque 12.4 % · medida 50.3 % · interlineado 37.8 px
"""
import sys
import numpy as np
from PIL import Image

REF = {"nombre": 32.0, "hangul": 32.0, "bajada": 20.0,
       "margen_pc": 14.2, "arriba_pc": 12.4, "medida_pc": 50.3, "interlinea": 37.8}


def bandas_de(mask):
    filas = mask.any(axis=1)
    salida, y, H = [], 0, mask.shape[0]
    while y < H:
        if filas[y]:
            y0 = y
            while y < H and filas[y]:
                y += 1
            salida.append((y0, y - 1))
        else:
            y += 1
    return salida


def alto_de(mask, banda, x0, x1):
    sub = mask[banda[0]:banda[1] + 1, x0:x1 + 1]
    ys = np.where(sub.any(axis=1))[0]
    return ys.max() - ys.min() + 1, banda[0] + ys.min()


def main(foto_path, render_path, esperadas=6):
    foto = np.asarray(Image.open(foto_path).convert("RGB").resize((1080, 1920)), np.int16)
    comp = np.asarray(Image.open(render_path).convert("RGB"), np.int16)
    mask = np.abs(comp - foto).max(axis=2) > 24
    H, W = mask.shape

    bandas = bandas_de(mask)
    print(f"bandas de texto: {len(bandas)}  (esperadas {esperadas})")
    if len(bandas) != esperadas:
        print("  !! alguna línea se partió o se fusionó. Revisá --medida antes de seguir.")
    for i, (a, b) in enumerate(bandas):
        xs = np.where(mask[a:b + 1].any(axis=0))[0]
        print(f"    {i}: y {a:>4}-{b:<4} x {xs.min():>4}-{xs.max():<4} ancho {xs.max()-xs.min()+1}")

    if len(bandas) >= 3:
        xs0 = np.where(mask[bandas[0][0]:bandas[0][1] + 1].any(axis=0))[0]
        xs2 = np.where(mask[bandas[2][0]:bandas[2][1] + 1].any(axis=0))[0]
        n, ny = alto_de(mask, bandas[0], xs0.min(), xs0.min() + 34)
        h = bandas[1][1] - bandas[1][0] + 1
        b_, by = alto_de(mask, bandas[2], xs2.min(), xs2.min() + 20)
        print("\naltura de tinta        real   referencia")
        for etq, v, r in (("nombre", n, REF["nombre"]), ("hangul", h, REF["hangul"]),
                          ("bajada", b_, REF["bajada"])):
            print(f"  {etq:<8} {v:>10.1f}   {r:>8.1f}   {'ok' if abs(v-r) <= 1.5 else 'DESVIADO'}")
        print(f"\n  nombre -> hangul (tope a tope) {bandas[1][0]-ny:6.1f}   ref 49.9")
        print(f"  hangul -> bajada (tope a tope) {by-bandas[1][0]:6.1f}   ref 63.4")

    xs = np.where(mask.any(axis=0))[0]
    ys = np.where(mask.any(axis=1))[0]
    izq, der = xs.min(), W - 1 - xs.max()
    ancla = "left" if izq < der else "right"
    margen = min(izq, der)
    inter = np.mean([bandas[i + 1][0] - bandas[i][0] for i in range(2, len(bandas) - 1)]) \
        if len(bandas) > 3 else float("nan")
    print(f"\ngeometría               real            referencia")
    print(f"  ancla                 {ancla:<15} —")
    print(f"  margen                {margen:>4.0f} px ({100*margen/W:4.1f} %)  {REF['margen_pc']:>4.1f} %")
    print(f"  arranque              {ys.min():>4.0f} px ({100*ys.min()/H:4.1f} %)  {REF['arriba_pc']:>4.1f} %")
    print(f"  medida                {xs.max()-xs.min():>4.0f} px ({100*(xs.max()-xs.min())/W:4.1f} %)  {REF['medida_pc']:>4.1f} %")
    print(f"  interlineado          {inter:>4.1f} px          {REF['interlinea']:>4.1f} px")

    # ¿el texto pisa algo? buscar la primera fila con detalle fuerte por debajo
    g = np.asarray(Image.open(foto_path).convert("L").resize((1080, 1920)), np.float32) / 255
    det = np.array([g[y:y + 10].std() for y in range(0, H - 10, 10)])
    abajo = [i * 10 for i, v in enumerate(det) if v > 0.035 and i * 10 > ys.min()]
    if not abajo:
        print("\n  la foto no tiene detalle fuerte por debajo del bloque.")
        return
    primera = abajo[0]
    aire = primera - ys.max()
    print(f"\n  primer detalle fuerte de la foto: y {primera}")
    if aire < 0:
        print(f"  !! EL TEXTO PISA UN ELEMENTO: se superpone {-aire} px. Hay que subir o acortar el bloque.")
    elif aire < 40:
        print(f"  aire {aire} px — pasa, pero es poco: no entra otra línea.")
    else:
        print(f"  aire {aire} px — holgado.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    esperadas = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    main(sys.argv[1], sys.argv[2], esperadas)
