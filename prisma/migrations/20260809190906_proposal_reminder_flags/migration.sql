-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "reminderSentT0" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderSentT60" BOOLEAN NOT NULL DEFAULT false;
