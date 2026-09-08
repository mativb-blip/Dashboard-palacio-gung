/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `InspirationNote` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "InspirationNote" ADD COLUMN "editedAt" TIMESTAMP(3);

-- Antes de soltar la columna vieja: si alguna nota ya se había corregido, esa
-- fecha es la única señal de que su texto cambió. `updatedAt` se movía con
-- cualquier escritura, así que solo cuenta como edición si se separó de
-- `createdAt` — el segundo de margen absorbe el desfasaje del insert.
UPDATE "InspirationNote"
SET "editedAt" = "updatedAt"
WHERE "updatedAt" - "createdAt" > interval '1 second';

ALTER TABLE "InspirationNote" DROP COLUMN "updatedAt";
