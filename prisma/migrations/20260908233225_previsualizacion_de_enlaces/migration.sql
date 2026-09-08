-- AlterTable
ALTER TABLE "InspirationLink" ADD COLUMN     "previewDescription" TEXT,
ADD COLUMN     "previewFetchedAt" TIMESTAMP(3),
ADD COLUMN     "previewImage" TEXT,
ADD COLUMN     "previewSite" TEXT,
ADD COLUMN     "previewTitle" TEXT;
