-- CreateTable
CREATE TABLE "ConnectionBundle" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionBundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionBundle_token_key" ON "ConnectionBundle"("token");

-- CreateIndex
CREATE INDEX "ConnectionBundle_clinicId_idx" ON "ConnectionBundle"("clinicId");

-- AlterTable
ALTER TABLE "ConnectionLink" ADD COLUMN "bundleId" TEXT;

-- CreateIndex
CREATE INDEX "ConnectionLink_bundleId_idx" ON "ConnectionLink"("bundleId");

-- AddForeignKey
ALTER TABLE "ConnectionBundle" ADD CONSTRAINT "ConnectionBundle_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionLink" ADD CONSTRAINT "ConnectionLink_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ConnectionBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
