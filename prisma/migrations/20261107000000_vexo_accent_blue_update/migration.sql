-- Novo tom de azul da marca aprovado (testado isolado na aba Automações,
-- PRs #185-189) -- era #3b82f6, agora #2b87bd. Atualiza o DEFAULT da coluna
-- pra instalações novas, e também a linha singleton existente, mas SÓ se
-- ela ainda estiver no valor antigo (ou seja, ninguém personalizou essa cor
-- pela tela Configurações) -- preserva qualquer customização manual feita
-- por um admin.
ALTER TABLE "ThemeSettings" ALTER COLUMN "vexoAccent" SET DEFAULT '#2b87bd';

UPDATE "ThemeSettings" SET "vexoAccent" = '#2b87bd' WHERE "vexoAccent" = '#3b82f6';
