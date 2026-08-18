-- CreateTable
CREATE TABLE "ProposalCaptionOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalCaptionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalMusicOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalMusicOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalCaptionOption_proposalId_idx" ON "ProposalCaptionOption"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalMusicOption_proposalId_idx" ON "ProposalMusicOption"("proposalId");

-- AddForeignKey
ALTER TABLE "ProposalCaptionOption" ADD CONSTRAINT "ProposalCaptionOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalMusicOption" ADD CONSTRAINT "ProposalMusicOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada propuesta existente arranca con su caption actual como la
-- (única) alternativa, ya elegida. Sin esto quedarían propuestas sin ninguna
-- opción y el panel no tendría nada que mostrar ni que aprobar.
INSERT INTO "ProposalCaptionOption" ("id", "proposalId", "text", "selected", "order", "createdAt")
SELECT gen_random_uuid()::text, p."id", p."caption", true, 0, p."createdAt"
FROM "Proposal" p;
