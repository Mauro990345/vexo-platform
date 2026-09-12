-- AlterTable
-- facebookPageId deixa de ser obrigatório: o fluxo de conexão do Instagram
-- migrou de "Login do Facebook para Empresas" pra "Instagram API with
-- Instagram Login" (ver src/lib/instagram.ts), que não passa mais por uma
-- Página do Facebook. Linhas existentes mantêm o valor que já tinham.
ALTER TABLE "InstagramAccount" ALTER COLUMN "facebookPageId" DROP NOT NULL;
