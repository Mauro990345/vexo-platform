-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "whatsappInstanceName" TEXT,
ADD COLUMN     "whatsappStatus" TEXT,
ADD COLUMN     "whatsappStatusCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_whatsappInstanceName_key" ON "Clinic"("whatsappInstanceName");

