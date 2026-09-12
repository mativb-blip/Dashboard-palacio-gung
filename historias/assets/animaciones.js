/* ------------------------------------------------------------------
   Las tres animaciones, en un solo lugar: las usan tanto las piezas que
   se renderizan como la hoja de comparación.

   Cada una devuelve una línea de tiempo PAUSADA de 5 s. Quien la llama
   decide si la registra para renderizar o la reproduce para mirarla.

   Criterio común: el sistema es photo-led y sin decoración, así que el
   movimiento tiene que ser corto y terminar temprano. Salvo la cámara,
   todo cierra antes del segundo 1.5 y después la pieza se queda quieta.
   ------------------------------------------------------------------ */
window.ANIMACIONES = {

  /* A — CÁMARA
     El movimiento le pertenece a la FOTO, que es la protagonista. El
     texto solo aparece y se queda quieto: es un epígrafe, no un actor.
     Acercamiento del 5% en los 5 s, con ease "none" a propósito — un
     ease hace que parezca una animación de interfaz; lineal parece una
     cámara de verdad.
     OJO: si la foto se mueve, el hueco donde vive el texto se mueve con
     ella. Verificado en esta foto (al 8% la zona neutra pasa de y 580 a
     550 y el bloque termina en 491), pero hay que medirlo por foto. */
  camara: function () {
    var tl = gsap.timeline({ paused: true });
    tl.fromTo("#foto",   { scale: 1 },      { scale: 1.05, duration: 5,   ease: "none" },     0);
    tl.fromTo("#bloque", { autoAlpha: 0 },  { autoAlpha: 1, duration: 0.9, ease: "sine.out" }, 0.3);
    return tl;
  },

  /* B — ENTRADA ESCALONADA
     La foto queda fija y el texto llega en tres tiempos: nombre, hangul,
     bajada. La subida es de 14px sobre 1920 — un 0.7%. En la pieza
     type-led usé 128px porque ahí la tipografía era el espectáculo; acá
     el texto tiene que LLEGAR, no actuar. */
  entrada: function () {
    var tl = gsap.timeline({ paused: true });
    var sube = { y: 14, autoAlpha: 0 };
    var pone = { y: 0, autoAlpha: 1, ease: "power2.out" };
    tl.fromTo("#n", sube, Object.assign({ duration: 0.70 }, pone), 0.25);
    tl.fromTo("#h", sube, Object.assign({ duration: 0.70 }, pone), 0.40);
    tl.fromTo("#b", sube, Object.assign({ duration: 0.80 }, pone), 0.62);
    tl.set({}, {}, 5);
    return tl;
  },

  /* C — REVELADO POR LÍNEA
     Cada línea sube desde detrás de su propia máscara, escalonadas. Es
     la más "diseñada" de las tres, y ahí está su riesgo: le devuelve el
     protagonismo a la tipografía, que es justo lo contrario de lo que
     pide el sistema. Va acá para poder comparar, no porque la recomiende.
     105% en vez de 100% para que las colas queden bien escondidas. */
  revelado: function () {
    var tl = gsap.timeline({ paused: true });
    tl.fromTo(".linea", { yPercent: 105 },
              { yPercent: 0, duration: 0.75, ease: "power3.out", stagger: 0.09 }, 0.2);
    tl.set({}, {}, 5);
    return tl;
  }
};
