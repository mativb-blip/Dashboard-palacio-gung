import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

/** Primer Administrador — bootstrap de confianza inicial del sistema.
 * Configurable por deployment (cada cliente nuevo pasa su propio admin). */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "mativb@gmail.com";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Matías Velázquez";

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "ADMIN",
    },
  });

  // Bootstrap opcional de contraseña para un entorno nuevo (ej. un deploy de
  // prueba con una base vacía): solo corre si se pasa la variable Y el
  // usuario todavía no tiene contraseña cargada, para no pisar la real.
  const bootstrapPassword = process.env.SEED_ADMIN_PASSWORD;
  if (bootstrapPassword && !admin.password) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { password: await bcrypt.hash(bootstrapPassword, SALT_ROUNDS) },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
