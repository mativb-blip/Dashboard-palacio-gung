-- CreateTable
CREATE TABLE "InspirationReel" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspirationReel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationReel_createdAt_idx" ON "InspirationReel"("createdAt");
