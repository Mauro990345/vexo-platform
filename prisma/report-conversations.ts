import { PrismaClient } from "@prisma/client";
import {
  parseReportArgs,
  computeReportPeriod,
  leadReportLabel,
  hasRealLeadMessage,
  formatConversationLine,
  formatBrazilDateTime,
  summarizeByStatus,
  summarizeByDay,
  countDistinctLeads,
  type ConversationReportRow,
  type ConversationStatusValue,
} from "./report-conversations-logic";

const prisma = new PrismaClient();

// Script ÚNICO, SOMENTE LEITURA (não é rota nem botão da interface, não
// vira comando permanente no package.json) — relatório de conversas
// criadas num período, por clínica (todas, por padrão). NUNCA escreve,
// atualiza nem apaga nada no banco: só prisma.*.findMany/groupBy daqui
// pra baixo, em nenhum momento prisma.*.create/update/delete.
//
// Uso:
//   npx tsx prisma/report-conversations.ts                           # últimos 30 dias, todas as clínicas
//   npx tsx prisma/report-conversations.ts --days=7                  # últimos 7 dias
//   npx tsx prisma/report-conversations.ts --days=7 --clinic=<id ou nome>

async function resolveClinicIds(clinicFilter: string): Promise<{ id: string; name: string }[]> {
  return prisma.clinic.findMany({
    where: {
      OR: [
        { id: clinicFilter },
        { name: { contains: clinicFilter, mode: "insensitive" } },
        { slug: { contains: clinicFilter, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
  });
}

async function main(): Promise<void> {
  const { days, clinic: clinicFilter } = parseReportArgs(process.argv.slice(2));
  const period = computeReportPeriod(new Date(), days);

  let clinicIds: string[] | undefined;
  if (clinicFilter) {
    const clinics = await resolveClinicIds(clinicFilter);
    if (clinics.length === 0) {
      console.log(`Nenhuma clínica encontrada para --clinic="${clinicFilter}" (tentei id, nome e slug). Rode sem --clinic pra ver todas.`);
      return;
    }
    clinicIds = clinics.map((c) => c.id);
    console.log(`Clínica(s) filtrada(s) por "--clinic=${clinicFilter}": ${clinics.map((c) => c.name).join(", ")}`);
  }

  console.log(
    `\nPeríodo analisado (America/Sao_Paulo): ${formatBrazilDateTime(period.start)} até ${formatBrazilDateTime(period.end)} ` +
      `(últimos ${days} dia${days === 1 ? "" : "s"})`
  );

  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: { gte: period.start, lte: period.end },
      ...(clinicIds ? { clinicId: { in: clinicIds } } : {}),
    },
    select: {
      id: true,
      leadId: true,
      status: true,
      createdAt: true,
      lead: { select: { name: true, igUsername: true } },
      clinic: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (conversations.length === 0) {
    console.log("\nNenhuma conversa criada neste período.");
    return;
  }

  // Uma query só (groupBy por conversationId+sender) pra contar mensagem
  // do lead e da IA de todas as conversas de uma vez, em vez de uma query
  // de contagem por conversa (evita N+1 numa leva potencialmente grande).
  const messageCounts = await prisma.message.groupBy({
    by: ["conversationId", "sender"],
    where: { conversationId: { in: conversations.map((c) => c.id) } },
    _count: { _all: true },
  });
  const countByConversation = new Map<string, Map<string, number>>();
  for (const entry of messageCounts) {
    const bySender = countByConversation.get(entry.conversationId) ?? new Map<string, number>();
    bySender.set(entry.sender, entry._count._all);
    countByConversation.set(entry.conversationId, bySender);
  }

  const rows: ConversationReportRow[] = conversations.map((conv) => {
    const bySender = countByConversation.get(conv.id);
    return {
      conversationId: conv.id,
      createdAt: conv.createdAt,
      leadId: conv.leadId,
      leadLabel: leadReportLabel(conv.lead),
      clinicName: conv.clinic.name,
      status: conv.status as ConversationStatusValue,
      leadMessageCount: bySender?.get("LEAD") ?? 0,
      aiMessageCount: bySender?.get("AI") ?? 0,
    };
  });

  console.log(`\nTotal de conversas criadas no período: ${rows.length}`);
  console.log(`Total de leads distintos: ${countDistinctLeads(rows)}`);

  console.log("\n--- Conversas (ordenadas por criação) ---");
  for (const row of rows) {
    console.log(formatConversationLine(row));
  }

  console.log("\n--- Resumo por status ---");
  for (const entry of summarizeByStatus(rows)) {
    console.log(`  ${entry.status}: ${entry.count}`);
  }

  console.log("\n--- Resumo por dia (conversas novas, por dia em America/Sao_Paulo) ---");
  for (const entry of summarizeByDay(rows, period)) {
    console.log(`  ${entry.day}: ${entry.count}`);
  }

  const withRealLeadMessage = rows.filter((row) => hasRealLeadMessage(row)).length;
  console.log(
    `\n--- Engajamento (item 5) ---\n` +
      `Com pelo menos 1 mensagem real do lead: ${withRealLeadMessage}\n` +
      `Só mensagem da IA/automática (lead nunca respondeu): ${rows.length - withRealLeadMessage}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
