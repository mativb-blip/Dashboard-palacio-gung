/* ------------------------------------------------------------------
   Línea de tiempo de la historia. La comparten index.html y
   variants/alpha.html, así que hay una sola versión de la animación.

   S es el factor de velocidad: TODOS los tiempos y duraciones pasan por
   t()/d(), de modo que retunear la pieza entera es cambiar esta constante.
   Los números literales de abajo son los originales, sin escalar.

   Con S = 1.8 el bloque A termina de salir en 3.04 s y el B entra en
   3.06 s. El relevo es seco a propósito: si se cruzan, los dos textos se
   superponen y el audit de layout lo marca como content_overlap.
   ------------------------------------------------------------------ */
window.buildStoryTimeline = function () {
  var S = 1.8;
  var t = function (v) { return v / S; };
  var d = function (v) { return v / S; };

  var tl = gsap.timeline({ paused: true });

  tl.fromTo("#glow",      { scale: 1.07, opacity: 0.45 }, { scale: 1, opacity: 1, duration: d(2.6),  ease: "sine.out" },     t(0));
  tl.fromTo("#k-mark",    { y: 24,  autoAlpha: 0 },       { y: 0, autoAlpha: 1,   duration: d(0.66), ease: "power3.out" },   t(0.12));
  tl.fromTo("#k-rule",    { scaleX: 0 },                  { scaleX: 1,            duration: d(0.6),  ease: "power3.inOut" }, t(0.62));
  tl.fromTo("#a1",        { y: 128, autoAlpha: 0 },       { y: 0, autoAlpha: 1,   duration: d(0.9),  ease: "power4.out" },   t(0.86));
  tl.fromTo("#a2",        { y: 128, autoAlpha: 0 },       { y: 0, autoAlpha: 1,   duration: d(0.9),  ease: "power4.out" },   t(1.12));
  tl.fromTo("#microtext", { autoAlpha: 0 },               { autoAlpha: 0.55,      duration: d(1.1),  ease: "sine.out" },     t(1.5));
  tl.to    ("#microtext",                                 { y: -16,               duration: d(6.0),  ease: "sine.inOut" },   t(1.6));
  tl.to    ("#w-open",                                    { scale: 1.07, yoyo: true, repeat: 1, duration: d(0.46), ease: "sine.inOut" }, t(1.95));
  tl.to    ("#g-a",                                       { y: -12,               duration: d(2.4),  ease: "sine.inOut" },   t(2.5));
  tl.to    ("#g-a",                                       { y: -78, autoAlpha: 0, duration: d(0.55), ease: "power2.in" },    t(4.92));
  tl.fromTo("#g-b",       { autoAlpha: 0 },               { autoAlpha: 1,         duration: d(0.35), ease: "sine.out" },     t(5.5));
  tl.fromTo("#b1",        { y: 110, autoAlpha: 0 },       { y: 0, autoAlpha: 1,   duration: d(0.88), ease: "power4.out" },   t(5.56));
  tl.fromTo("#b2",        { y: 110, autoAlpha: 0 },       { y: 0, autoAlpha: 1,   duration: d(0.88), ease: "power4.out" },   t(5.8));
  tl.to    ("#w-pedir",                                   { scale: 1.07, yoyo: true, repeat: 1, duration: d(0.46), ease: "sine.inOut" }, t(6.55));
  tl.fromTo("#b-rule",    { autoAlpha: 0, scaleX: 0 },    { autoAlpha: 1, scaleX: 1, duration: d(0.7), ease: "power3.inOut" }, t(6.75));
  tl.to    ("#g-b",                                       { y: -10,               duration: d(1.9),  ease: "sine.inOut" },   t(7.1));

  return tl;
};

/* El registro en window.__timelines NO va acá sino inline en cada HTML:
   el lint de hyperframes lo busca en el documento y un archivo externo no
   le alcanza (missing_timeline_registry). Y ese error de lint apaga los
   audits de layout y contraste, que es justo lo que no queremos. */
