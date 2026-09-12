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

/* ------------------------------------------------------------------
   D — SCRAMBLE
   Pedida explícitamente. Tiene tres trampas propias de ESTE proyecto,
   todas medidas antes de escribirla.

   1) EL HANGUL NECESITA SU PROPIO JUEGO DE CARACTERES. El set latino
      por defecto no sirve, y además solo se puede revolver con sílabas
      que la fuente TENGA: nuestro subconjunto trae 175, y cualquier otra
      saldría como cuadro vacío. Se leen del cmap, no se escriben a mano.
      De yapa, todas las sílabas hangul tienen el mismo avance (0.920em),
      así que el hangul revuelto no cambia de ancho ni un píxel.

   2) REVOLVER CAMBIA EL ANCHO DE LA LÍNEA. ScrambleText mantiene la
      CANTIDAD de caracteres, no el ancho: una 'm' mide 1.061em y una 'i'
      0.269em. Simulado sobre 20.000 tiradas, la línea larga de la bajada
      (547px en reposo) llegaba a 781px con A-Z y a 720px usando su propio
      texto — contra una caja de 594px. Se partía en dos en pleno
      movimiento. Por eso el pool de la bajada excluye la 'm', la única
      que se pasa del tope: con los 16 restantes el peor caso ABSOLUTO es
      712px, o sea borde izquierdo en x=215. Garantizado, no probable.
      Y .linea lleva white-space: nowrap como segundo cerrojo.

   3) ScrambleText USA Math.random, y un render siembra la línea de tiempo
      cuadro por cuadro. Sin sembrar, dos renders del mismo proyecto dan
      archivos distintos. Acá se reemplaza Math.random por un generador
      determinista sembrado con el tiempo de la línea, así el mismo
      segundo da siempre el mismo revuelto.
      Límite conocido: si un cuadro se renderizara DOS veces seguidas en
      el mismo instante, la segunda pasada devolvería otra cosa. No pasa
      en el camino normal de render, donde cada cuadro es un tiempo
      distinto, pero queda anotado.
   ------------------------------------------------------------------ */
window.ANIMACIONES.scramble = function () {
  gsap.registerPlugin(ScrambleTextPlugin);
  var tl = gsap.timeline({ paused: true });

  sembrarAzar(tl);

  // sílabas que la fuente realmente tiene: se leen de la pieza, no se inventan
  var HANGUL = "가각간감갓고곡곤곰곳구국군굼굿그극근금긋기긱긴김깃다닥단담닷도독돈돔돗" +
               "두둑둔둠둣드득든듬듯디딕딘딤딧마막만맘맛모목몬몸못무묵문뭄뭇므믁믄믐믓" +
               "미믹민밈밋바박반밤밧보복본봄봇부북분붐붓브븍븐븜븟비빅빈빔빗";
  var NOMBRE = "MandGukoi";        // del propio nombre: peor caso 340px de 594
  var BAJADA = ".acefgilnoqrstuá"; // el texto MENOS la 'm': peor caso 712px

  function revolver(sel, chars, dur, retraso, cuando) {
    document.querySelectorAll(sel).forEach(function (el, i) {
      if (!el.dataset.final) { el.dataset.final = el.textContent; }
      var entra = cuando + i * 0.12;
      // Sin esto, la línea muestra su texto FINAL hasta que le toca el turno:
      // se ve bien, después se rompe y después se arregla, que es al revés de
      // lo que tiene que pasar. Aparece recién cuando empieza a revolverse.
      tl.set(el, { autoAlpha: 0 }, 0);
      tl.set(el, { autoAlpha: 1 }, entra);
      tl.to(el, {
        duration: dur,
        ease: "none",
        scrambleText: {
          text: el.dataset.final,
          chars: chars,
          speed: 0.5,
          revealDelay: retraso
        }
      }, entra);
    });
  }

  revolver("#n .linea", NOMBRE, 1.2, 0.30, 0.15);
  revolver("#h .linea", HANGUL, 1.0, 0.25, 0.35);
  revolver("#b .linea", BAJADA, 1.0, 0.22, 0.55);
  tl.set({}, {}, 5);
  return tl;
};

/* Generador determinista: mismo segundo -> mismo revuelto. Ver la nota 3. */
function sembrarAzar(tl) {
  if (window.__azarSembrado) { window.__azarSembrado(tl); return; }
  var ultimo = null, i = 0, linea = tl;
  Math.random = function () {
    var t = Math.round(linea.time() * 1e4);
    if (t !== ultimo) { ultimo = t; i = 0; }
    var x = (t * 2654435761 + (i++) * 40503) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    return x / 4294967296;
  };
  window.__azarSembrado = function (nueva) { linea = nueva; ultimo = null; i = 0; };
}
