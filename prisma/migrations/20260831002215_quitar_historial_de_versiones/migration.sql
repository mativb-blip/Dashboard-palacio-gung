/*
  Warnings:

  - You are about to drop the `ProposalVersion` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProposalVersion" DROP CONSTRAINT "ProposalVersion_proposalId_fkey";

-- DropTable
DROP TABLE "ProposalVersion";
