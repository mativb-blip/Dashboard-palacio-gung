"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/dashboard/site-settings";

const SETTINGS_ID = "singleton";
// Límite generoso pero acotado: estas imágenes se guardan como data URL en la
// base de datos (no hay storage de blobs configurado todavía).
const MAX_DATA_URL_LENGTH = 3 * 1024 * 1024;

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Solo un Administrador puede hacer esto.");
  }
  return session;
}

function assertImageDataUrl(value: string, field: string) {
  if (!value.startsWith("data:image/")) {
    throw new Error(`${field}: el archivo debe ser una imagen.`);
  }
  if (value.length > MAX_DATA_URL_LENGTH) {
    throw new Error(`${field}: la imagen es demasiado pesada (máx. ~2MB).`);
  }
}

export async function getLoginAppearance() {
  const settings = await getSiteSettings();
  return {
    backgroundUrl: settings?.loginBackgroundUrl ?? null,
    logoUrl: settings?.loginLogoUrl ?? null,
  };
}

interface UpdateLoginAppearanceInput {
  backgroundDataUrl?: string | null;
  logoDataUrl?: string | null;
}

export async function updateLoginAppearance(input: UpdateLoginAppearanceInput) {
  await requireAdmin();

  const data: { loginBackgroundUrl?: string | null; loginLogoUrl?: string | null } = {};

  if (input.backgroundDataUrl !== undefined) {
    if (input.backgroundDataUrl) assertImageDataUrl(input.backgroundDataUrl, "Fondo");
    data.loginBackgroundUrl = input.backgroundDataUrl || null;
  }
  if (input.logoDataUrl !== undefined) {
    if (input.logoDataUrl) assertImageDataUrl(input.logoDataUrl, "Logo");
    data.loginLogoUrl = input.logoDataUrl || null;
  }

  await prisma.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });

  revalidatePath("/login");
}
