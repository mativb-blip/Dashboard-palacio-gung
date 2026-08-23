-- CreateTable
CREATE TABLE "InspirationPhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspirationPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationPhoto_createdAt_idx" ON "InspirationPhoto"("createdAt");
