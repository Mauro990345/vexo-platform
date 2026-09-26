-- CreateTable
CREATE TABLE "ClientPanelLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPanelLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPanelLink_clinicId_key" ON "ClientPanelLink"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPanelLink_token_key" ON "ClientPanelLink"("token");

-- AddForeignKey
ALTER TABLE "ClientPanelLink" ADD CONSTRAINT "ClientPanelLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
