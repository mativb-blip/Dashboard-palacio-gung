import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_BRAND, type ResolvedBrand } from "@/lib/dashboard/brand-defaults";

export const SETTINGS_ID = "singleton";

export { DEFAULT_BRAND, type ResolvedBrand };

/** Una sola consulta a SiteSettings por request — cacheada con `cache()` de
 * React para que layout.tsx y login/actions.ts (y cualquier otro server
 * caller) compartan el mismo resultado sin duplicar el round-trip. */
export const getSiteSettings = cache(async () => {
  return prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
});

/** Combina la fila real (si existe) sobre DEFAULT_BRAND, campo por campo. */
export function resolveBrand(
  settings: Awaited<ReturnType<typeof getSiteSettings>>,
): ResolvedBrand {
  return {
    brandName: settings?.brandName ?? DEFAULT_BRAND.brandName,
    brandColorPrimary: settings?.brandColorPrimary ?? DEFAULT_BRAND.brandColorPrimary,
    brandColorPrimaryDark: settings?.brandColorPrimaryDark ?? DEFAULT_BRAND.brandColorPrimaryDark,
    brandColorAccent: settings?.brandColorAccent ?? DEFAULT_BRAND.brandColorAccent,
    instagramHandle: settings?.instagramHandle ?? DEFAULT_BRAND.instagramHandle,
    senderEmail: settings?.senderEmail ?? DEFAULT_BRAND.senderEmail,
    commentNotifyTo: settings?.commentNotifyTo ?? DEFAULT_BRAND.commentNotifyTo,
    commentNotifyCc: settings?.commentNotifyCc ?? DEFAULT_BRAND.commentNotifyCc,
    contentPillars: settings?.contentPillars.length ? settings.contentPillars : DEFAULT_BRAND.contentPillars,
  };
}
