import { PrismaClient } from "@prisma/client";
import {
  RETENTION_WINDOW_MS,
  computeCutoff,
  matchesCleanupCriteria,
  cleanupWhereClause,
  groupByReason,
  countDistinctConversations,
  type FailedMessageRow,
} from "./instagram-failed-cleanup-logic";

const prisma = new PrismaClient();

// Script ÚNICO (não é rota nem botão da interface, não vira comando
// permanente no package.json) pra limpar as Message FAILED antigas do
// Instagram que sobraram na tela Status (/crm/clinicas/[id]/status) — o
// dono confirmou que são todas antigas. Mesmo padrão de segurança do
// cleanup anterior (prisma/cleanup-evolution-failed-whatsapp-messages.ts,
// que tratava as falhas de WhatsApp causadas pela Evolution errada):
//
//   1. SEMPRE roda em modo relatório primeiro (dry run) — mostra, por
//      início de failReason: total, data mais antiga/mais recente, e
//      quantas estão dentro/fora da janela de retenção de 48h. Mostra
//      também quantas conversas DISTINTAS seriam afetadas. Nada é
//      apagado neste modo.
//   2. Só apaga de verdade com a flag --apply.
//   3. O apagar roda dentro de uma transação interativa que RECONFERE o
//      conjunto de ids no banco (com cleanupWhereClause, calculado de
//      novo na hora de apagar — o corte de 48h se move, então o conjunto
//      exato pode ter crescido com novas falhas entre o relatório e o
//      --apply) e aborta se encontrar uma linha fora do relatório
//      original (nunca apaga uma linha que o relatório não mostrou).
//   4. Filtro: status=FAILED, channel=INSTAGRAM, createdAt mais antigo
//      que 48h atrás do instante em que o script roda. SEM filtro de
//      failReason (pedido explícito, diferente do cleanup anterior) —
//      mas NUNCA WhatsApp, nunca outro status, nunca uma falha do
//      Instagram dentro das últimas 48h.
//   5. Sem FK apontando pra Message (confirmado em schema.prisma — só
//      Conversation.messages aponta PRA Message, nunca o contrário) e
//      nada em Lead/Appointment referencia Message — apagar essas linhas
//      não afeta Conversation, Lead nem Appointment. O histórico exibido
//      na tela da conversa (toChatHistory, que lê Message por
//      conversationId) perde só essas linhas específicas — ver a
//      contagem de conversas afetadas no relatório, item 3 do pedido.
//
// Uso:
//   npx tsx prisma/cleanup-old-instagram-failed-messages.ts            # relatório só, não apaga nada
//   npx tsx prisma/cleanup-old-instagram-failed-messages.ts --apply    # apaga de verdade

function printReport(title: string, rows: FailedMessageRow[], now: Date): void {
  console.log(`\n${title} (total: ${rows.length})`);
  if (rows.length === 0) {
    console.log("  (nenhuma)");
    return;
  }

  const groups = groupByReason(rows, now);
  for (const g of groups) {
    console.log(
      `  ${g.total}x  "${g.reason}" — mais antiga: ${g.oldest.toISOString()} · mais recente: ${g.newest.toISOString()}`
    );
    console.log(
      `       dentro das últimas 48h (NUNCA apagada): ${g.withinRetentionWindow} · mais antiga que 48h (candidata a apagar): ${g.olderThanRetentionWindow}`
    );
  }

  console.log(`  Conversas distintas com pelo menos uma destas mensagens: ${countDistinctConversations(rows)}`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const now = new Date();
  const cutoff = computeCutoff(now);

  const allFailedInstagram = await prisma.message.findMany({
    where: { status: "FAILED", channel: "INSTAGRAM" },
    select: { id: true, channel: true, conversationId: true, createdAt: true, failReason: true },
  });
  printReport("ANTES — todas as Message FAILED do Instagram", allFailedInstagram, now);

  const toDelete = allFailedInstagram.filter((row) => matchesCleanupCriteria(row, now));
  console.log(
    `\nCorte (agora - ${RETENTION_WINDOW_MS / (60 * 60 * 1000)}h): ${cutoff.toISOString()} — linhas criadas antes disso são candidatas a apagar.`
  );
  printReport("Linhas que SERIAM apagadas (mais antigas que 48h)", toDelete, now);

  if (!apply) {
    console.log("\nModo relatório (dry run) — nada foi apagado. Rode de novo com --apply pra apagar essas linhas.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNenhuma linha mais antiga que 48h — nada a apagar.");
    return;
  }

  const idsToDelete = toDelete.map((r) => r.id);

  const deletedCount = await prisma.$transaction(async (tx) => {
    // Reconfere dentro da MESMA transação, com o filtro do banco e um
    // "agora" recalculado na hora — o corte de 48h se move entre o
    // relatório (leitura acima) e aqui. Só aborta se alguma linha do
    // relatório ORIGINAL não aparecer mais no recheck (ex.: por já ter
    // sido apagada por outra execução concorrente) — linhas NOVAS que
    // entraram na janela "mais antiga que 48h" nesse meio-tempo são
    // ignoradas por esta execução (nunca apaga mais do que o relatório
    // mostrou), não travam o abort.
    const recheck = await tx.message.findMany({ where: cleanupWhereClause(new Date()), select: { id: true } });
    const recheckIds = new Set(recheck.map((r) => r.id));
    const missing = idsToDelete.filter((id) => !recheckIds.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Abortado: ${missing.length} linha(s) do relatório não aparecem mais no recheck (possível execução concorrente). ` +
          `Rode o script de novo sem --apply pra ver o estado atual antes de tentar apagar.`
      );
    }

    const { count } = await tx.message.deleteMany({ where: { id: { in: idsToDelete } } });
    return count;
  });

  console.log(`\nApagadas ${deletedCount} Message (status FAILED, INSTAGRAM, mais antigas que 48h).`);

  const remaining = await prisma.message.findMany({
    where: { status: "FAILED", channel: "INSTAGRAM" },
    select: { id: true, channel: true, conversationId: true, createdAt: true, failReason: true },
  });
  printReport("DEPOIS — Message FAILED do Instagram que sobraram", remaining, new Date());
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
