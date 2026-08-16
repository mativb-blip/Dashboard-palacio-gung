-- CreateTable
CREATE TABLE "MoodboardSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodboardSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodboardElement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "url" TEXT,
    "filename" TEXT,
    "embedUrl" TEXT,
    "text" TEXT,
    "color" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodboardElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoodboardSession_ownerId_idx" ON "MoodboardSession"("ownerId");

-- CreateIndex
CREATE INDEX "MoodboardElement_sessionId_idx" ON "MoodboardElement"("sessionId");

-- AddForeignKey
ALTER TABLE "MoodboardSession" ADD CONSTRAINT "MoodboardSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodboardElement" ADD CONSTRAINT "MoodboardElement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MoodboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
