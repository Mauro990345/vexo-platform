-- AlterTable: firstBandDelaySeconds passa a ser por clínica, não global
ALTER TABLE "Clinic" ADD COLUMN     "firstBandDelaySeconds" INTEGER NOT NULL DEFAULT 45;

-- AlterTable
ALTER TABLE "AiSettings" DROP COLUMN "firstBandDelaySeconds";
