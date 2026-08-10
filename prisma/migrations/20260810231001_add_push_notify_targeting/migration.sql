-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "pushNotifyTo" TEXT;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
