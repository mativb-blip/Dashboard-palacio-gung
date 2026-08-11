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

/** Mail de notificación del Admin (User.notifyEmail — ver panel de
 * Usuarios, no el email de acceso) — usado como destinatario por default de
 * las notificaciones de comentario/aprobación cuando
 * SiteSettings.commentNotifyTo no está seteado explícitamente. Si hay más de
 * un ADMIN, toma el primero (createdAt asc) — este dashboard está pensado
 * para un solo Admin real. */
export const getAdminEmail = cache(async () => {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  return admin?.notifyEmail ?? null;
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
    pushNotifyTo: settings?.pushNotifyTo ?? DEFAULT_BRAND.pushNotifyTo,
    contentPillars: settings?.contentPillars.length ? settings.contentPillars : DEFAULT_BRAND.contentPillars,
  };
}
