// Apaga todas as linhas de FollowUpLog e FollowUpStep — necessário porque a
// migração 20260901003324_follow_up_dual_sequences adiciona uma coluna
// obrigatória (`trigger`) nessas duas tabelas, e o Postgres não aceita isso
// em tabelas com linhas existentes sem um valor padrão. É dado de teste
// pré-lançamento, seguro apagar.
//
// Como rodar (da raiz do projeto, com DATABASE_URL apontando pro túnel):
//   node delete-followup-rows.js
//
// Script de conserto único — depois que a migração estiver destravada, pode
// remover este arquivo do repositório (não faz parte do app).

const fs = require("fs");
const path = require("path");

if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não encontrado. Exporte antes de rodar.");
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const before = {
    logs: await prisma.followUpLog.count(),
    steps: await prisma.followUpStep.count(),
  };
  console.log(`Antes: FollowUpLog=${before.logs}, FollowUpStep=${before.steps}`);

  const deletedLogs = await prisma.followUpLog.deleteMany({});
  const deletedSteps = await prisma.followUpStep.deleteMany({});
  console.log(`Apagado: FollowUpLog=${deletedLogs.count}, FollowUpStep=${deletedSteps.count}`);

  const after = {
    logs: await prisma.followUpLog.count(),
    steps: await prisma.followUpStep.count(),
  };
  console.log(`Depois: FollowUpLog=${after.logs}, FollowUpStep=${after.steps}`);

  if (after.logs === 0 && after.steps === 0) {
    console.log("\nOK — as duas tabelas estão vazias. Pode seguir para destravar a migração.");
  } else {
    console.log("\nAlgo não bateu — as tabelas não ficaram vazias. Não siga para o próximo passo sem investigar.");
  }
}

main()
  .catch((err) => {
    console.error("Erro:", err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
