-- CreateTable
CREATE TABLE "InspirationNote" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspirationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationNote_createdAt_idx" ON "InspirationNote"("createdAt");
