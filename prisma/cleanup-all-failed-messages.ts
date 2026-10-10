import { PrismaClient } from "@prisma/client";
import { breakdownByChannelAndReason, type FailedMessageRow } from "./all-failed-messages-cleanup-logic";

const prisma = new PrismaClient();

// Script ÚNICO (não é rota nem botão da interface, não vira comando
// permanente no package.json) pra apagar TODAS as Message com
// status=FAILED, de qualquer canal e qualquer data — pedido explícito:
// sistema em fase de teste, sem usuários reais, o dono decidiu limpar
// tudo. Mais simples que os dois cleanups anteriores
// (cleanup-evolution-failed-whatsapp-messages.ts e
// cleanup-old-instagram-failed-messages.ts): sem corte de data, sem
// filtro de canal nem de failReason.
//
// SEGURANÇA, nesta ordem:
//   1. SEMPRE roda em modo relatório primeiro (dry run) — mostra a
//      contagem de Message FAILED por canal e início do failReason, E
//      (só leitura, NUNCA apagado) a contagem de outras tabelas de
//      erro/log, pra ajudar a achar onde estão as "centenas" que o dono
//      vê — ver printOtherErrorSources, abaixo.
//   2. Só apaga de verdade com a flag --apply.
//   3. O apagar roda dentro de uma transação interativa que RECONFERE o
//      conjunto de ids no banco antes de deletar — aborta se o conjunto
//      mudou desde o relatório (nunca apaga mais do que foi mostrado).
//   4. Apaga APENAS Message com status=FAILED — nenhuma outra tabela,
//      nenhuma Message com outro status.
//   5. Sem FK apontando pra Message (confirmado em schema.prisma — só
//      Conversation.messages aponta PRA Message, nunca o contrário) —
//      apagar essas linhas não afeta Conversation, Lead nem Appointment,
//      e não apaga nenhuma conversa.
//
// Uso:
//   npx tsx prisma/cleanup-all-failed-messages.ts            # relatório só, não apaga nada
//   npx tsx prisma/cleanup-all-failed-messages.ts --apply    # apaga de verdade

function printMessageBreakdown(title: string, rows: FailedMessageRow[]): void {
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

// SOMENTE LEITURA — nenhuma linha destas tabelas é apagada por este
// script, em nenhum modo (dry run ou --apply). Existe só pra responder
// "onde estão as 'centenas' que o dono vê" sem precisar adivinhar: conta
// o que parece erro/log em CADA tabela candidata do schema, uma a uma.
async function printOtherErrorSources(): Promise<void> {
  console.log("\n--- Outras tabelas de erro/log (SOMENTE CONTAGEM — nada aqui é apagado por este script) ---");

  const [webhookTotal, webhookInvalidSignature, webhookMatchFailure, webhookProcessingError] = await Promise.all([
    prisma.webhookLog.count(),
    prisma.webhookLog.count({ where: { signatureValid: false } }),
    prisma.webhookLog.count({ where: { matchFailureReason: { not: null } } }),
    prisma.webhookLog.count({ where: { processingError: { not: null } } }),
  ]);
  console.log(`WebhookLog — total: ${webhookTotal}`);
  console.log(`  assinatura inválida (signatureValid=false): ${webhookInvalidSignature}`);
  console.log(`  sem conta correspondente (matchFailureReason preenchido): ${webhookMatchFailure}`);
  console.log(`  erro de processamento (processingError preenchido): ${webhookProcessingError}`);

  // Conversation não tem um campo "error" dedicado pro gatilho SILENCE —
  // classifyConversation (anthropic.ts) grava o motivo da falha dentro do
  // próprio lastSilenceCheckReason, sempre prefixado com "[ERRO" (ver o
  // catch de parsing lá) — mesma convenção já usada por
  // /crm/dispatch-status (isParseError) pra distinguir "avaliada, decidiu
  // não reengajar" de "avaliação falhou de verdade".
  const conversationsWithSilenceCheckError = await prisma.conversation.count({
    where: { lastSilenceCheckReason: { startsWith: "[ERRO" } },
  });
  console.log(
    `Conversation com a ÚLTIMA avaliação do gatilho SILENCE tendo falhado (lastSilenceCheckReason começando com "[ERRO"): ${conversationsWithSilenceCheckError}`
  );

  const followUpSettings = await prisma.followUpSettings.findUnique({ where: { id: "singleton" } });
  console.log(
    `FollowUpSettings.lastSilenceCheckError (erro do ÚLTIMO ciclo global do worker, singleton): ${
      followUpSettings?.lastSilenceCheckError ? `preenchido — "${followUpSettings.lastSilenceCheckError.slice(0, 150)}"` : "vazio"
    }`
  );

  const weeklySummaryWithSendError = await prisma.weeklySummary.count({ where: { sendError: { not: null } } });
  console.log(`WeeklySummary com sendError preenchido: ${weeklySummaryWithSendError}`);

  // FollowUpLog NÃO tem campo de erro/falha nenhum no schema — só
  // progresso (triggeredAt/respondedAt/lastStepIndex). O mais próximo de
  // "falha" é um log "travado" (mesma derivação de /crm/dispatch-status):
  // a conversa saiu do status FOLLOW_UP sem o log ser fechado, ou o
  // trigger não tem nenhum FollowUpStep cadastrado. Informativo — nunca
  // apagado por este script (e nunca apagado por nenhum script: fechar
  // um FollowUpLog travado é uma ação da própria tela de Follow-up, fora
  // do escopo daqui).
  const openLogs = await prisma.followUpLog.findMany({
    where: { respondedAt: null },
    select: { trigger: true, conversation: { select: { status: true } } },
  });
  const [silenceStepsCount, noShowStepsCount] = await Promise.all([
    prisma.followUpStep.count({ where: { trigger: "SILENCE" } }),
    prisma.followUpStep.count({ where: { trigger: "NO_SHOW" } }),
  ]);
  const stuckLogs = openLogs.filter((log) => {
    const stepsConfigured = log.trigger === "NO_SHOW" ? noShowStepsCount : silenceStepsCount;
    return log.conversation.status !== "FOLLOW_UP" || stepsConfigured === 0;
  });
  console.log(
    `FollowUpLog aberto e "travado" (conversa fora de FOLLOW_UP, ou trigger sem passo cadastrado) — informativo, igual à tela /crm/dispatch-status, NUNCA apagado por nenhum script: ${stuckLogs.length} de ${openLogs.length} abertos`
  );

  console.log(
    "ReminderLog: não tem campo de erro/falha no schema — só registra o instante de um lembrete ENVIADO com sucesso, nunca uma tentativa que falhou. Não é fonte das falhas vistas na tela Status."
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const allFailed = await prisma.message.findMany({
    where: { status: "FAILED" },
    select: { id: true, channel: true, failReason: true },
  });
  printMessageBreakdown("Message com status FAILED (TODO canal, TODA data) — candidatas a apagar", allFailed);

  await printOtherErrorSources();

  console.log(
    "\nConfirmação de segurança (lida de prisma/schema.prisma): nenhuma FK aponta PARA Message (só " +
      "Conversation.messages aponta PRA Message, na direção inversa) — apagar estas linhas não afeta " +
      "Conversation, Lead nem Appointment, e não apaga nenhuma conversa."
  );

  if (!apply) {
    console.log("\nModo relatório (dry run) — nada foi apagado. Rode de novo com --apply pra apagar essas linhas.");
    return;
  }

  if (allFailed.length === 0) {
    console.log("\nNenhuma Message com status FAILED — nada a apagar.");
    return;
  }

  const idsToDelete = allFailed.map((r) => r.id);

  const deletedCount = await prisma.$transaction(async (tx) => {
    // Reconfere dentro da MESMA transação — se alguma Message virou
    // FAILED (ou deixou de ser) entre o relatório (leitura acima) e
    // agora, os ids não vão bater e o script aborta em vez de arriscar
    // apagar algo fora do que foi mostrado no relatório.
    const recheck = await tx.message.findMany({ where: { status: "FAILED" }, select: { id: true } });
    const recheckIds = new Set(recheck.map((r) => r.id));
    const sameSet = recheckIds.size === idsToDelete.length && idsToDelete.every((id) => recheckIds.has(id));
    if (!sameSet) {
      throw new Error(
        `Abortado: o conjunto de Message FAILED mudou entre o relatório (${idsToDelete.length}) e a exclusão (${recheckIds.size}). ` +
          `Rode o script de novo sem --apply pra ver o estado atual antes de tentar apagar.`
      );
    }

    const { count } = await tx.message.deleteMany({ where: { id: { in: idsToDelete } } });
    return count;
  });

  console.log(`\nApagadas ${deletedCount} Message (status FAILED, qualquer canal, qualquer data).`);

  const remaining = await prisma.message.findMany({
    where: { status: "FAILED" },
    select: { id: true, channel: true, failReason: true },
  });
  printMessageBreakdown("DEPOIS — Message com status FAILED que sobraram", remaining);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
