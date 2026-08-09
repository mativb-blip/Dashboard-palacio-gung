-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "approvalCriteriaChecked" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "approvalCriteriaCheckedAt" TIMESTAMP(3),
ADD COLUMN     "approvalInvalidatedReason" TEXT,
ADD COLUMN     "approvalReminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contentPillar" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "approvalCriteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contentPillars" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ProposalVersion" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "video" TEXT,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalVersion_proposalId_idx" ON "ProposalVersion"("proposalId");

-- AddForeignKey
ALTER TABLE "ProposalVersion" ADD CONSTRAINT "ProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
