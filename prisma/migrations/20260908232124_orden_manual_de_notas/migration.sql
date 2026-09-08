-- DropIndex
DROP INDEX "InspirationNote_createdAt_idx";

-- AlterTable
ALTER TABLE "InspirationNote" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Las notas que ya existan conservan el orden que venían mostrando (la más
-- nueva arriba). Sin esto quedarían todas en 0 y el desempate lo decidiría
-- Postgres, o sea que la lista se barajaría sola en el deploy.
UPDATE "InspirationNote" n
SET "order" = s.fila - 1
FROM (
  SELECT id, row_number() OVER (ORDER BY "createdAt" DESC) AS fila
  FROM "InspirationNote"
) s
WHERE n.id = s.id;

-- CreateIndex
CREATE INDEX "InspirationNote_order_idx" ON "InspirationNote"("order");
