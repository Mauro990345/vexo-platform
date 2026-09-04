-- CreateTable
CREATE TABLE "ConnectionLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionLink_token_key" ON "ConnectionLink"("token");

-- CreateIndex
CREATE INDEX "ConnectionLink_clinicId_idx" ON "ConnectionLink"("clinicId");

-- AddForeignKey
ALTER TABLE "ConnectionLink" ADD CONSTRAINT "ConnectionLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
