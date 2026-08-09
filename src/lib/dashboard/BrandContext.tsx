"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_BRAND } from "@/lib/dashboard/brand-defaults";

/** Solo lo que un componente cliente necesita para *mostrar* algo — los
 * destinatarios de notificación viajan porque CommentsPanel los muestra
 * ("Se envía a..."), pero `senderEmail` no: solo se usa server-side
 * (remitente de Microsoft Graph), no hace falta mandarlo al bundle. */
export interface Brand {
  brandName: string;
  brandColorPrimary: string;
  brandColorPrimaryDark: string;
  brandColorAccent: string;
  instagramHandle: string;
  commentNotifyTo: string;
  commentNotifyCc: string;
  /** Lista editable por un Admin (ver /usuarios) — ficha 2. */
  contentPillars: string[];
  /** Lista editable por un Admin (ver /usuarios) — ficha 4. */
  approvalCriteria: string[];
}

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
