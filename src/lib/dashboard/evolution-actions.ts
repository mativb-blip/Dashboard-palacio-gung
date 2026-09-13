"use server";

// Lo que mira la sección Evolución. Todo se deriva de las propuestas que ya
// existen — no hay tabla de métricas ni nada que haya que ir cargando aparte,
// y eso es a propósito: una estadística que depende de que alguien la
// alimente a mano deja de ser cierta a la segunda semana.
//
// Se agrega en el server y viaja ya sumado: mandar 300 propuestas al
// navegador para contarlas ahí sería pagar el peso del contenido (artes,
// captions, comentarios) para mostrar cuatro números.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeProposalStatus } from "@/lib/dashboard/proposals";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import type { Proposal, ProposalFormat, ProposalStatus } from "@/types/dashboard";

/** Cuántos meses mira el gráfico de evolución. Un año entero: menos no deja
 * ver una temporada, y más no entra legible en el ancho de una tarjeta. */
const MESES = 12;

const FORMATOS: ProposalFormat[] = ["Carrusel", "Reel", "Historia", "Post simple"];
const ESTADOS: ProposalStatus[] = [
  "Aprobado",
  "Cambios solicitados",
  "Pendiente de re-aprobación",
  "En revisión",
];

export interface PuntoMensual {
  /** "2026-09" */
  mes: string;
  /** "sep" — armado en el server para no depender del locale del navegador. */
  etiqueta: string;
  propuestas: number;
  aprobadas: number;
}

export interface Tajada {
  nombre: string;
  cantidad: number;
}

export interface EvolutionStats {
  total: number;
  aprobadas: number;
  esperando: number;
  comentariosSinResolver: number;
  /** Del mes en curso, para el encabezado. */
  esteMes: number;
  /** Mismo dato del mes anterior, para poder decir "vs. el mes pasado" sin
   * que el cliente tenga que buscarlo en la serie. */
  mesAnterior: number;
  porMes: PuntoMensual[];
  porEstado: Tajada[];
  porFormato: Tajada[];
  porPilar: Tajada[];
}

/** Las 12 claves "yyyy-mm" hasta el mes en curso, de la más vieja a la más
 * nueva. Se arman todas aunque no haya nada cargado: un mes sin propuestas
 * es información —hubo un hueco— y saltearlo lo escondería. */
function ultimosMeses(hoy: Date): { mes: string; etiqueta: string }[] {
  const salida: { mes: string; etiqueta: string }[] = [];
  for (let i = MESES - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    salida.push({
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      etiqueta: d.toLocaleDateString("es-DO", { month: "short" }).replace(".", ""),
    });
  }
  return salida;
}

export async function getEvolutionStats(): Promise<EvolutionStats> {
  // Mismo criterio que getProposals(): cualquiera con sesión ve esto. Son las
  // mismas propuestas que ya puede abrir una por una, contadas.
  const session = await auth();
  if (!session) throw new Error("Necesitás iniciar sesión.");

  const rows = await prisma.proposal.findMany({
    select: {
      date: true,
      format: true,
      contentPillar: true,
      departmentApprovals: true,
      approvalInvalidatedReason: true,
      comments: { select: { resolved: true } },
    },
  });

  // El estado NO es la columna `status`: se deriva (ver computeProposalStatus).
  // Contar la columna daría un número que no coincide con lo que muestra la
  // pantalla, que es la peor clase de estadística.
  const estados = rows.map((r) =>
    computeProposalStatus({
      departmentApprovals: r.departmentApprovals,
      approvalInvalidatedReason: r.approvalInvalidatedReason ?? undefined,
      comments: r.comments.map((c) => ({ resolved: c.resolved })),
    } as Proposal),
  );

  const hoy = new Date();
  const meses = ultimosMeses(hoy);
  const indicePorMes = new Map(meses.map((m, i) => [m.mes, i]));
  const porMes: PuntoMensual[] = meses.map((m) => ({
    mes: m.mes,
    etiqueta: m.etiqueta,
    propuestas: 0,
    aprobadas: 0,
  }));

  const porFormato = new Map<string, number>(FORMATOS.map((f) => [f, 0]));
  const porPilar = new Map<string, number>();
  const porEstado = new Map<string, number>(ESTADOS.map((e) => [e, 0]));

  rows.forEach((r, i) => {
    // `date` es "yyyy-mm-dd" como texto (ver el schema), así que el mes son
    // sus primeros siete caracteres — sin pasar por Date y sin arrastrar el
    // problema de zona horaria que eso traería.
    const idx = indicePorMes.get(r.date.slice(0, 7));
    if (idx !== undefined) {
      porMes[idx].propuestas++;
      if (estados[i] === "Aprobado") porMes[idx].aprobadas++;
    }
    porFormato.set(r.format, (porFormato.get(r.format) ?? 0) + 1);
    porEstado.set(estados[i], (porEstado.get(estados[i]) ?? 0) + 1);
    const pilar = r.contentPillar ?? "Sin categorizar";
    porPilar.set(pilar, (porPilar.get(pilar) ?? 0) + 1);
  });

  // Los pilares se listan en el orden de la marca, no por cantidad: así la
  // barra de un pilar no salta de lugar entre una visita y la otra. Los que
  // no están en la lista vigente (renombrados, quitados) van al final.
  const brand = resolveBrand(await getSiteSettings());
  const ordenPilares = [...brand.contentPillars, "Sin categorizar"];
  const pilaresOrdenados = [...porPilar.entries()].sort((a, b) => {
    const ia = ordenPilares.indexOf(a[0]);
    const ib = ordenPilares.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const aprobadas = estados.filter((e) => e === "Aprobado").length;

  return {
    total: rows.length,
    aprobadas,
    esperando: rows.length - aprobadas,
    comentariosSinResolver: rows.reduce(
      (n, r) => n + r.comments.filter((c) => !c.resolved).length,
      0,
    ),
    esteMes: porMes[porMes.length - 1]?.propuestas ?? 0,
    mesAnterior: porMes[porMes.length - 2]?.propuestas ?? 0,
    porMes,
    porEstado: ESTADOS.map((e) => ({ nombre: e, cantidad: porEstado.get(e) ?? 0 })),
    porFormato: FORMATOS.map((f) => ({ nombre: f, cantidad: porFormato.get(f) ?? 0 })),
    porPilar: pilaresOrdenados.map(([nombre, cantidad]) => ({ nombre, cantidad })),
  };
}
