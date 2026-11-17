-- Foto de perfil do Instagram da PRÓPRIA conta conectada da clínica
-- (círculo com a foto no lugar das iniciais, ver ClinicAvatar.tsx) — mesmo
-- padrão de Lead.profilePictureUrl/profilePictureFetchedAt, já existente.
-- Puramente aditivo.

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN "profilePictureUrl" TEXT;
ALTER TABLE "InstagramAccount" ADD COLUMN "profilePictureFetchedAt" TIMESTAMP(3);
