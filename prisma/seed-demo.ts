import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Popula uma clínica fictícia com leads em cada estágio do pipeline, só para
// visualização do CRM. Idempotente: se a clínica demo já existir, não
// duplica nada. Para remover tudo depois, basta apagar a Clinic — todas as
// relações têm onDelete: Cascade (ver instrução impressa no final).

const DEMO_SLUG = "clinica-demo-vexo";

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}
function daysFromNow(d: number, hour: number) {
  const date = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  const existing = await prisma.clinic.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    const counts = await prisma.conversation.groupBy({
      by: ["status"],
      where: { clinicId: existing.id },
      _count: true,
    });
    console.log(`A clínica demo já existe (id: ${existing.id}). Nada foi criado de novo.`);
    console.log("Conversas por status:", counts.map((c) => `${c.status}=${c._count}`).join(", "));
    console.log(`\nPara remover tudo depois:\nDELETE FROM "Clinic" WHERE slug = '${DEMO_SLUG}';`);
    return;
  }

  const clinic = await prisma.clinic.create({
    data: {
      name: "Clínica Demo VEXO",
      slug: DEMO_SLUG,
      active: true,
      pilotStartedAt: new Date(),
      pilotEndsAt: daysFromNow(21, 0),
      reminderConfig: { create: { hoursBefore: [24, 3] } },
    },
  });

  // Abordagens manuais registradas hoje (alimenta as métricas do dashboard)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.approachLog.create({ data: { clinicId: clinic.id, loggedDate: today, count: 18 } });

  // 1) NOVO CONTATO — acabou de responder à abordagem manual
  const fernanda = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: "demo-fernanda", igUsername: "fer.lima23", name: "Fernanda Lima" },
  });
  const convFernanda = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: fernanda.id,
      status: "NEW",
      lastLeadMessageAt: hoursAgo(0.2),
      lastMessageAt: hoursAgo(0.2),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: convFernanda.id,
      direction: "INBOUND",
      sender: "LEAD",
      content: "Oi! Vi sua mensagem, aceito sim saber mais 😊",
      status: "SENT",
      sentAt: hoursAgo(0.2),
    },
  });

  // 2) EM CONVERSA — trocando mensagens com a IA
  const bruno = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: "demo-bruno", igUsername: "bruno.costa", name: "Bruno Costa" },
  });
  const convBruno = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: bruno.id,
      status: "IN_CONVERSATION",
      lastLeadMessageAt: hoursAgo(0.15),
      lastAiMessageAt: hoursAgo(1.9),
      lastMessageAt: hoursAgo(0.15),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: convBruno.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: "Oi, tudo bem? Recebi sua mensagem sobre o botox",
        status: "SENT",
        sentAt: hoursAgo(2),
      },
      {
        conversationId: convBruno.id,
        direction: "OUTBOUND",
        sender: "AI",
        content: "Oi Bruno! Tudo ótimo 😊 Consigo te passar mais detalhes e já ver um horário pra avaliação, pode ser?",
        status: "SENT",
        sentAt: hoursAgo(1.9),
      },
      {
        conversationId: convBruno.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: "Pode sim, quero saber valores",
        status: "SENT",
        sentAt: hoursAgo(0.15),
      },
    ],
  });

  // 3) AGENDADO
  const camila = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: "demo-camila", igUsername: "camila.rocha", name: "Camila Rocha" },
  });
  const convCamila = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: camila.id,
      status: "SCHEDULED",
      lastLeadMessageAt: hoursAgo(5),
      lastAiMessageAt: hoursAgo(4.9),
      lastMessageAt: hoursAgo(4.9),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: convCamila.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: "Quinta às 15h fica bom pra mim!",
        status: "SENT",
        sentAt: hoursAgo(5),
      },
      {
        conversationId: convCamila.id,
        direction: "OUTBOUND",
        sender: "AI",
        content: "Perfeito, Camila! Já deixei confirmado pra quinta às 15h. Te mando os detalhes por aqui 💙",
        status: "SENT",
        sentAt: hoursAgo(4.9),
      },
    ],
  });
  await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      conversationId: convCamila.id,
      leadId: camila.id,
      scheduledAt: daysFromNow(3, 15),
      status: "SCHEDULED",
    },
  });

  // 4) FOLLOW-UP — sumiu no meio da conversa
  const diego = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: "demo-diego", igUsername: "diego.alves", name: "Diego Alves" },
  });
  const convDiego = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: diego.id,
      status: "FOLLOW_UP",
      lastLeadMessageAt: hoursAgo(30),
      lastAiMessageAt: hoursAgo(29.8),
      lastMessageAt: hoursAgo(20),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: convDiego.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: "Oi, ainda tenho interesse na lente de resina",
        status: "SENT",
        sentAt: hoursAgo(30),
      },
      {
        conversationId: convDiego.id,
        direction: "OUTBOUND",
        sender: "AI",
        content: "Que ótimo, Diego! Você prefere manhã ou tarde pra sua avaliação?",
        status: "SENT",
        sentAt: hoursAgo(29.8),
      },
      {
        conversationId: convDiego.id,
        direction: "OUTBOUND",
        sender: "AI",
        content: "Oi! Ainda tem interesse em agendar sua avaliação? Consigo te ajudar a encontrar um horário 🙂",
        status: "SENT",
        sentAt: hoursAgo(20),
      },
    ],
  });
  await prisma.followUpLog.create({
    data: { conversationId: convDiego.id, reason: "sumiu_na_conversa", triggeredAt: hoursAgo(20) },
  });

  // 5) PERDIDO — recusou explicitamente
  const elaine = await prisma.lead.create({
    data: { clinicId: clinic.id, igScopedId: "demo-elaine", igUsername: "elainesouza", name: "Elaine Souza" },
  });
  const convElaine = await prisma.conversation.create({
    data: {
      clinicId: clinic.id,
      leadId: elaine.id,
      status: "LOST",
      lastLeadMessageAt: hoursAgo(72),
      lastAiMessageAt: hoursAgo(71.9),
      lastMessageAt: hoursAgo(71.9),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: convElaine.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: "Não vou conseguir agora, obrigada",
        status: "SENT",
        sentAt: hoursAgo(72),
      },
      {
        conversationId: convElaine.id,
        direction: "OUTBOUND",
        sender: "AI",
        content: "Ah, entendi! Sem problemas, qualquer coisa é só chamar por aqui 🙂",
        status: "SENT",
        sentAt: hoursAgo(71.9),
      },
    ],
  });

  console.log(`Clínica demo criada: ${clinic.name} (id: ${clinic.id})`);
  console.log("5 conversas criadas — uma em cada estágio do pipeline.");
  console.log(`\nPara remover tudo depois (apaga em cascata leads/conversas/mensagens/agendamento):`);
  console.log(`DELETE FROM "Clinic" WHERE slug = '${DEMO_SLUG}';`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
