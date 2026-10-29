import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Script de teste, SOMENTE pra Clínica Demo (ver DEMO_SLUG, mesma clínica
// de seed-demo.ts) — cria dados pra testar o botão "Retorno"/a faixa de
// Reativação e o card "Quente" sem precisar esperar dias de verdade
// passarem. Idempotente: se os leads de demo de retorno já existirem
// (marcados pelo prefixo RETORNO_DEMO_IGSID_PREFIX no igScopedId), não
// duplica nada. Apagável DEPOIS sem afetar o resto da Clínica Demo — ver
// instrução impressa no final (filtra só pelo prefixo, não apaga a
// clínica inteira).
//
// Uso: npm run prisma:seed:return-demo

const DEMO_SLUG = "clinica-demo-vexo";
const RETORNO_DEMO_IGSID_PREFIX = "retorno-demo-";

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const clinic = await prisma.clinic.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (!clinic) {
    console.log(`Clínica Demo (slug "${DEMO_SLUG}") ainda não existe — rode "npm run prisma:seed:demo" primeiro.`);
    return;
  }

  const existing = await prisma.lead.findFirst({
    where: { clinicId: clinic.id, igScopedId: { startsWith: RETORNO_DEMO_IGSID_PREFIX } },
    select: { id: true },
  });
  if (existing) {
    console.log("Dados de teste do botão Retorno/Quente já existem nesta clínica. Nada foi criado de novo.");
    console.log(`\nPara remover só estes dados depois (sem afetar o resto da Clínica Demo):\nDELETE FROM "Lead" WHERE "igScopedId" LIKE '${RETORNO_DEMO_IGSID_PREFIX}%';`);
    return;
  }

  // 3 pacientes atendidos (agendamento no passado, status SCHEDULED —
  // mesmo padrão de appointmentDisplayStatus, metrics.ts: SCHEDULED/
  // CONFIRMED com scheduledAt no passado já exibe como "Compareceu" sem
  // precisar de nenhum status novo gravado) — nenhum marcou "Não
  // compareceu", todos com conversationId (candidatos a Reativação, ver
  // selectReactivationCandidates). Só o de 117 dias marca um prazo de
  // retorno manual (120 dias) — fica com a janela de contato bem no
  // começo (atendimento + 120 dias ≈ agora), pra já aparecer como card de
  // Reativação assim que o script roda. Os outros dois (27 e 57 dias)
  // ficam SEM marcação — usam os prazos padrão da clínica (ver
  // ReactivationConfig.defaultPeriods) quando ela os configurar.
  const patients: { daysAgo: number; name: string; returnPeriodDays: number | null }[] = [
    { daysAgo: 27, name: "Teste Retorno 27 Dias", returnPeriodDays: null },
    { daysAgo: 57, name: "Teste Retorno 57 Dias", returnPeriodDays: null },
    { daysAgo: 117, name: "Teste Retorno 117 Dias (120 marcado)", returnPeriodDays: 120 },
  ];

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i]!;
    const igScopedId = `${RETORNO_DEMO_IGSID_PREFIX}patient-${i}`;
    const lead = await prisma.lead.create({
      data: { clinicId: clinic.id, igScopedId, igUsername: `retorno.demo.${i}`, name: p.name, phone: `1199999000${i}` },
    });
    const conversation = await prisma.conversation.create({
      data: { clinicId: clinic.id, leadId: lead.id, status: "SCHEDULED", lastLeadMessageAt: daysAgo(p.daysAgo), lastMessageAt: daysAgo(p.daysAgo) },
    });
    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        conversationId: conversation.id,
        scheduledAt: daysAgo(p.daysAgo),
        status: "SCHEDULED",
        returnPeriodDays: p.returnPeriodDays,
      },
    });
    console.log(`Paciente criado: ${p.name} (atendido há ${p.daysAgo} dias${p.returnPeriodDays ? `, retorno marcado em ${p.returnPeriodDays} dias` : ""}).`);
  }

  // 1 lead "Quente": nunca agendou (sem nenhum Appointment), conversa com
  // status elegível (não SCHEDULED/NEEDS_HUMAN), parado há exatamente 2
  // dias (gatilho do passo 1, ver HOT_LEAD_STEP_DAYS, hot-lead-cards.ts) e
  // com uma mensagem com sinal de interesse de horário.
  const hotLeadLead = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: `${RETORNO_DEMO_IGSID_PREFIX}hot-lead`, igUsername: "retorno.demo.quente", name: "Teste Quente Parado 2 Dias" },
  });
  const hotLeadConversation = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: hotLeadLead.id,
      status: "IN_CONVERSATION",
      lastLeadMessageAt: daysAgo(2),
      lastMessageAt: daysAgo(2),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: hotLeadConversation.id,
      direction: "INBOUND",
      sender: "LEAD",
      content: "Oi! Vocês têm horário disponível essa semana às 14h?",
      status: "SENT",
      sentAt: daysAgo(2),
    },
  });
  console.log("Lead Quente criado: parado há 2 dias, com sinal de horário (passo 1 da cadência deve aparecer).");

  console.log(`\nPara remover só estes dados de teste depois (sem afetar o resto da Clínica Demo):\nDELETE FROM "Lead" WHERE "igScopedId" LIKE '${RETORNO_DEMO_IGSID_PREFIX}%';`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
