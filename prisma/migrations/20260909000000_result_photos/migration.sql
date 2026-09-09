-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "resultPhotoSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ResultPhoto" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultPhoto_clinicId_category_idx" ON "ResultPhoto"("clinicId", "category");

-- AddForeignKey
ALTER TABLE "ResultPhoto" ADD CONSTRAINT "ResultPhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
