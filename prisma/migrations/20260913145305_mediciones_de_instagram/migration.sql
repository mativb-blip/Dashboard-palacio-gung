-- CreateTable
CREATE TABLE "InstagramSnapshot" (
    "id" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL,
    "viewers" INTEGER NOT NULL,
    "interactions" INTEGER NOT NULL,
    "follows" INTEGER NOT NULL,
    "unfollows" INTEGER NOT NULL,
    "followersEnd" INTEGER NOT NULL,
    "viewersFollowersPct" DOUBLE PRECISION NOT NULL,
    "interactionsFollowersPct" DOUBLE PRECISION NOT NULL,
    "profileVisits" INTEGER NOT NULL,
    "bioLinkTaps" INTEGER NOT NULL,
    "addressTaps" INTEGER NOT NULL,
    "viewersPosts" INTEGER NOT NULL,
    "viewersReels" INTEGER NOT NULL,
    "viewersStories" INTEGER NOT NULL,
    "interactionsPosts" INTEGER NOT NULL,
    "interactionsReels" INTEGER NOT NULL,
    "interactionsStories" INTEGER NOT NULL,
    "likes" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "replies" INTEGER,
    "bestDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestHourFrom" INTEGER,
    "bestHourTo" INTEGER,
    "notes" TEXT,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramSnapshot_periodEnd_idx" ON "InstagramSnapshot"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramSnapshot_periodStart_periodEnd_key" ON "InstagramSnapshot"("periodStart", "periodEnd");
