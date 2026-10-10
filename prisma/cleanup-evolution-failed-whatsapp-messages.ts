import { PrismaClient } from "@prisma/client";
import {
  CORRECTION_CUTOFF_UTC,
  TARGET_MARKER,
  TARGET_KNOWN_REASONS,
  matchesCleanupCriteria,
  cleanupWhereClause,
  breakdownByChannelAndReason,
  type FailedMessageRow,
} from "./evolution-cleanup-logic";

const prisma = new PrismaClient();

// Script ÚNICO (não é rota nem botão da interface, não vira comando
// permanente no package.json) pra apagar as Message FAILED antigas,
// causadas pelo worker apontando pra uma Evolution/instância errada —
// corrigido em produção em 2026-10-09 ~22:15 (America/Sao_Paulo). Depois
// dessa correção, qualquer FAILED novo é um problema de verdade — manter
// as antigas misturadas na tela Status (ver /crm/clinicas/[id]/status)
// só dificulta notar isso.
//
// A regra de QUAIS linhas batem (matchesCleanupCriteria/cleanupWhereClause)
// mora em evolution-cleanup-logic.ts, sem nenhum efeito colateral, só pra
// poder ser testada isolada (ver evolution-cleanup-logic.test.ts) sem
// precisar de banco de verdade nem correr o risco de rodar main() por
// engano ao importar o módulo num teste.
//
// SEGURANÇA, nesta ordem:
//   1. SEMPRE roda em modo relatório primeiro (dry run) — mostra a
//      contagem ANTES, agrupada por canal e por início do failReason, e
//      quantas linhas BATERIAM com o filtro de apagar, sem apagar nada.
//   2. Só apaga de verdade com a flag --apply.
//   3. O apagar em si roda dentro de uma transação interativa que
//      RECONFERE a contagem na hora (evita apagar mais do que o
//      relatório mostrou, numa corrida rara com algo escrevendo nesse
//      meio-tempo) e aborta (lança) se os números não baterem.
//   4. Sem FK apontando pra Message (confirmado em schema.prisma — só
//      Conversation.messages aponta PRA Message, nunca o contrário) e
//      Appointment.whatsappConfirmationSentAt é um campo PRÓPRIO do
//      Appointment, nunca derivado da Message — apagar essas linhas não
//      afeta Conversation, Lead, Appointment nem a confirmação já
//      marcada como enviada.
//
// Uso:
//   npx tsx prisma/cleanup-evolution-failed-whatsapp-messages.ts            # relatório só, não apaga nada
//   npx tsx prisma/cleanup-evolution-failed-whatsapp-messages.ts --apply    # apaga de verdade

function printBreakdown(title: string, rows: FailedMessageRow[]): void {
  const { total, byChannel, byChannelAndReason } = breakdownByChannelAndReason(rows);
  console.log(`\n${title} (total: ${total})`);
  if (total === 0) {
    console.log("  (nenhuma)");
    return;
  }
  console.log("  Por canal:");
  for (const [channel, count] of [...byChannel.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${channel}: ${count}`);
  }
  console.log("  Por canal + início do failReason:");
  for (const [key, count] of [...byChannelAndReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}x  ${key}`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const allFailed = await prisma.message.findMany({
    where: { status: "FAILED" },
    select: { id: true, channel: true, createdAt: true, failReason: true },
  });
  printBreakdown("ANTES — todas as Message com status FAILED", allFailed);

  const toDelete = allFailed.filter(matchesCleanupCriteria);
  printBreakdown(
    `Linhas que BATEM com o filtro de limpeza (WHATSAPP, antes de ${CORRECTION_CUTOFF_UTC.toISOString()}, failReason com "${TARGET_MARKER}" + ${TARGET_KNOWN_REASONS.map((r) => `"${r}"`).join(" ou ")})`,
    toDelete
  );

  if (!apply) {
    console.log("\nModo relatório (dry run) — nada foi apagado. Rode de novo com --apply pra apagar essas linhas.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNenhuma linha bate com o filtro — nada a apagar.");
    return;
  }

  const idsToDelete = toDelete.map((r) => r.id);

  const deletedCount = await prisma.$transaction(async (tx) => {
    // Reconfere dentro da MESMA transação, com o filtro do banco (não a
    // lista em memória de cima) — se algo mudou entre a leitura acima e
    // agora, os ids não vão bater e o script aborta em vez de arriscar
    // apagar algo fora do que foi mostrado no relatório.
    const recheck = await tx.message.findMany({ where: cleanupWhereClause(), select: { id: true } });
    const recheckIds = new Set(recheck.map((r) => r.id));
    const sameSet = recheckIds.size === idsToDelete.length && idsToDelete.every((id) => recheckIds.has(id));
    if (!sameSet) {
      throw new Error(
        `Abortado: o conjunto de linhas mudou entre o relatório (${idsToDelete.length}) e a exclusão (${recheckIds.size}). ` +
          `Rode o script de novo sem --apply pra ver o estado atual antes de tentar apagar.`
      );
    }

    const { count } = await tx.message.deleteMany({ where: { id: { in: idsToDelete } } });
    return count;
  });

  console.log(`\nApagadas ${deletedCount} Message (status FAILED, WHATSAPP, Evolution API, antes do corte).`);

  const remaining = await prisma.message.findMany({
    where: { status: "FAILED" },
    select: { id: true, channel: true, createdAt: true, failReason: true },
  });
  printBreakdown("DEPOIS — Message com status FAILED que sobraram", remaining);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
