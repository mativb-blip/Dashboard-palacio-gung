-- CreateTable
CREATE TABLE "GalleryPhotoComment" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryPhotoComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryPhotoComment_photoId_idx" ON "GalleryPhotoComment"("photoId");

-- AddForeignKey
ALTER TABLE "GalleryPhotoComment" ADD CONSTRAINT "GalleryPhotoComment_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
