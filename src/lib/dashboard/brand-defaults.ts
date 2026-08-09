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
  approvalCriteria: string[];
}

/** Valores placeholder, genéricos — se usan como fallback campo por campo
 * cuando la fila de SiteSettings todavía no los tiene cargados, para que un
 * deployment nuevo (otra cuenta) solo tenga que cargar los suyos. */
export const DEFAULT_BRAND: ResolvedBrand = {
  brandName: "Mi Marca",
  brandColorPrimary: "#163f6b",
  brandColorPrimaryDark: "#102e4e",
  brandColorAccent: "#e81f35",
  instagramHandle: "tu.marca",
  senderEmail: "contenidos@tu-marca.com",
  commentNotifyTo: "admin@tu-marca.com",
  commentNotifyCc: "",
  contentPillars: ["Producto", "Marca/cultura", "Testimonios", "Institucional"],
  approvalCriteria: [
    "Cumple con la identidad de marca",
    "Ortografía y gramática revisadas",
    "Aprobación legal si aplica",
    "Formato correcto para la red de destino",
  ],
};
