-- Segundo link de acesso do cliente (ver DESIGN.md) — mesmo shape de
-- ClientPanelLink, só pra outra finalidade (abre só a Fila de abordagem,
-- /dashboard/fila, nunca o painel inteiro).

-- CreateTable
CREATE TABLE "ClientFilaLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFilaLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientFilaLink_clinicId_key" ON "ClientFilaLink"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFilaLink_token_key" ON "ClientFilaLink"("token");

-- AddForeignKey
ALTER TABLE "ClientFilaLink" ADD CONSTRAINT "ClientFilaLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
