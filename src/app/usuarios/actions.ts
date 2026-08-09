"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SETTINGS_ID } from "@/lib/dashboard/site-settings";
import type { Role } from "@/generated/prisma/client";

const ROLES: Role[] = ["ADMIN", "EDITOR", "COMMENTER"];
const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Solo un Administrador puede hacer esto.");
  }
  return session;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "COMMENTER");
  const role = ROLES.includes(roleInput as Role) ? (roleInput as Role) : "COMMENTER";
  const password = String(formData.get("password") ?? "");

  if (!email) throw new Error("El email es obligatorio.");
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      role,
      // Opcional al crear: sin contraseña, esta persona todavía no puede
      // iniciar sesión hasta que un Admin se la cargue.
      password: password ? await bcrypt.hash(password, SALT_ROUNDS) : null,
    },
  });

  revalidatePath("/usuarios");
}

export async function setUserPassword(userId: string, password: string) {
  await requireAdmin();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { password: hash } });
  revalidatePath("/usuarios");
}

export async function updateUserRole(userId: string, roleInput: string) {
  await requireAdmin();
  const role = ROLES.includes(roleInput as Role) ? (roleInput as Role) : undefined;
  if (!role) throw new Error("Rol inválido.");

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/usuarios");
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("No podés eliminar tu propio usuario.");
  }
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/usuarios");
}

/** Parsea una lista de una por línea, tal como la escribe un Admin en el
 * textarea — descarta líneas vacías, no fuerza mayúsculas ni nada. */
function parseListInput(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function updateContentPillars(formData: FormData) {
  await requireAdmin();
  const pillars = parseListInput(String(formData.get("raw") ?? ""));
  await prisma.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, contentPillars: pillars },
    update: { contentPillars: pillars },
  });
  revalidatePath("/usuarios");
  revalidatePath("/");
  revalidatePath("/calendario");
  revalidatePath("/nueva-propuesta");
}
