-- AlterTable
-- Se agrega nullable primero, se hace backfill desde el email de acceso
-- (mismo criterio que ya usaba getAdminEmail() antes de este cambio) y
-- recién ahí se pasa a NOT NULL — no hay valor fijo válido para todas las
-- filas existentes.
ALTER TABLE "User" ADD COLUMN     "notifyEmail" TEXT;

UPDATE "User" SET "notifyEmail" = "email" WHERE "notifyEmail" IS NULL;

ALTER TABLE "User" ALTER COLUMN "notifyEmail" SET NOT NULL;
