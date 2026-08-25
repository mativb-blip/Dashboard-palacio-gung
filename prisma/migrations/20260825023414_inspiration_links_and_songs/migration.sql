-- CreateTable
CREATE TABLE "InspirationLink" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'link',
    "url" TEXT,
    "title" TEXT,
    "audioUrl" TEXT,
    "audioName" TEXT,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspirationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationLink_kind_createdAt_idx" ON "InspirationLink"("kind", "createdAt");
