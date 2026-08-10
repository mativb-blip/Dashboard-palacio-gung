// Datos puros, sin importar Prisma — este módulo lo usa tanto
// site-settings.ts (server) como BrandContext.tsx (client, para el valor
// default del Context). Si DEFAULT_BRAND viviera en site-settings.ts,
// importarlo desde un componente cliente arrastraría @prisma/client/pg al
// bundle del navegador (rompe el build: "Module not found: util/types").

export interface ResolvedBrand {
  brandName: string;
  brandColorPrimary: string;
  brandColorPrimaryDark: string;
  brandColorAccent: string;
  instagramHandle: string;
  senderEmail: string;
  commentNotifyTo: string;
  commentNotifyCc: string;
  contentPillars: string[];
}

/** Valores placeholder, genéricos — se usan como fallback campo por campo
 * cuando la fila de SiteSettings todavía no los tiene cargados, para que un
 * deployment nuevo (otra cuenta) solo tenga que cargar los suyos. */
export const DEFAULT_BRAND: ResolvedBrand = {
  brandName: "Palacio Gung",
  // Tema oscuro (clevante.cz) — brandColorPrimary/-Dark pasan a ser el
  // acento único #7da3c0 (antes navy #163f6b). brandColorAccent (rojo)
  // NO se toca: es semántico ("cambios solicitados"), no decorativo.
  brandColorPrimary: "#7da3c0",
  brandColorPrimaryDark: "#5a758a",
  brandColorAccent: "#e81f35",
  instagramHandle: "tu.marca",
  senderEmail: "contenidos@tu-marca.com",
  commentNotifyTo: "admin@tu-marca.com",
  commentNotifyCc: "",
  contentPillars: ["Producto", "Marca/cultura", "Testimonios", "Institucional"],
};
