import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Popula uma clínica fictícia com vários leads em cada estágio do pipeline,
// só para visualização do CRM com volume. Idempotente: se a clínica demo já
// existir, não duplica nada. Para remover tudo depois, basta apagar a
// Clinic — todas as relações têm onDelete: Cascade (ver instrução impressa
// no final).

const DEMO_SLUG = "clinica-demo-vexo";
const LEADS_PER_STAGE = 8;

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}
function daysFromNow(d: number, hour: number) {
  const date = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
  date.setHours(hour, 0, 0, 0);
  return date;
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

// 40 nomes únicos, 8 por estágio (fatias do mesmo pool).
const NAME_POOL = [
  "Fernanda Lima", "Bruno Costa", "Camila Rocha", "Diego Alves", "Elaine Souza",
  "Rafael Martins", "Juliana Ferreira", "Thiago Oliveira", "Patrícia Gomes", "Marcelo Santos",
  "Aline Pereira", "Lucas Barbosa", "Vanessa Ribeiro", "Gustavo Carvalho", "Renata Almeida",
  "Felipe Nascimento", "Beatriz Cardoso", "André Teixeira", "Priscila Moreira", "Rodrigo Dias",
  "Larissa Correia", "Eduardo Pinto", "Débora Castro", "Vinícius Araújo", "Carolina Melo",
  "Leonardo Ramos", "Amanda Fonseca", "Igor Monteiro", "Natália Cavalcanti", "Paulo Freitas",
  "Mariana Duarte", "Rogério Batista", "Letícia Nunes", "Fábio Vieira", "Isabela Machado",
  "Daniel Rezende", "Tatiane Farias", "Marcos Andrade", "Cláudia Peixoto", "Henrique Lopes",
];

function igUsernameFor(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, ".");
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
  await prisma.approachLog.create({ data: { clinicId: clinic.id, loggedDate: today, count: 60 } });

  let nameIndex = 0;
  const nextName = () => NAME_POOL[nameIndex++]!;

  async function createLead(igScopedId: string, name: string) {
    return prisma.lead.create({
      data: { clinicId: clinic.id, igScopedId, igUsername: igUsernameFor(name), name },
    });
  }

  // 1) NOVO CONTATO — acabou de responder à abordagem manual
  const newContactVariants = [
    "Oi! Vi sua mensagem, aceito sim saber mais 😊",
    "Olá, tudo bem? Fiquei curiosa com sua mensagem!",
    "Oi! Pode me contar mais sobre a promoção?",
    "Boa tarde! Adorei a ideia, me conta mais",
  ];
  for (let i = 0; i < LEADS_PER_STAGE; i++) {
    const name = nextName();
    const lead = await createLead(`demo-new-${i}`, name);
    const sentAt = hoursAgo(0.1 + i * 0.4); // de ~6min a ~3h atrás
    const conv = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        status: "NEW",
        lastLeadMessageAt: sentAt,
        lastMessageAt: sentAt,
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: pick(newContactVariants, i),
        status: "SENT",
        sentAt,
      },
    });
  }

  // 2) EM CONVERSA — trocando mensagens com a IA
  const inConvoOpeners = [
    "Oi, tudo bem? Recebi sua mensagem sobre o botox",
    "Oi! Vi que vocês fazem lente de resina, é isso?",
    "Olá, me falaram bem daí, queria entender melhor",
    "Oi, tudo bom? Sobre o preenchimento, como funciona?",
  ];
  const inConvoReplies = [
    "Oi {first}! Tudo ótimo 😊 Consigo te passar mais detalhes e já ver um horário pra avaliação, pode ser?",
    "Oi {first}! Claro, fazemos sim. Quer que eu já veja um horário pra você conhecer melhor?",
    "Oi {first}! Que bom te ver por aqui. Posso te explicar como funciona e já consultar a agenda?",
  ];
  const inConvoFollowups = [
    "Pode sim, quero saber valores",
    "Sim, pode ver um horário pra mim",
    "Ok! Prefiro de tarde, se tiver",
    "Legal, me passa mais informações",
  ];
  for (let i = 0; i < LEADS_PER_STAGE; i++) {
    const name = nextName();
    const first = name.split(" ")[0];
    const lead = await createLead(`demo-conversa-${i}`, name);
    const t0 = hoursAgo(2 + i * 1.3);
    const t1 = hoursAgo(1.9 + i * 1.3);
    const t2 = hoursAgo(0.1 + i * 0.3);
    const conv = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        status: "IN_CONVERSATION",
        lastLeadMessageAt: t2,
        lastAiMessageAt: t1,
        lastMessageAt: t2,
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "INBOUND", sender: "LEAD", content: pick(inConvoOpeners, i), status: "SENT", sentAt: t0 },
        { conversationId: conv.id, direction: "OUTBOUND", sender: "AI", content: pick(inConvoReplies, i).replace("{first}", first!), status: "SENT", sentAt: t1 },
        { conversationId: conv.id, direction: "INBOUND", sender: "LEAD", content: pick(inConvoFollowups, i), status: "SENT", sentAt: t2 },
      ],
    });
  }

  // 3) AGENDADO
  const scheduleDayTexts = [
    "Quinta às 15h fica bom pra mim!",
    "Pode ser segunda de manhã?",
    "Sexta à tarde eu consigo",
    "Terça às 10h tá ótimo",
  ];
  const scheduleConfirms = [
    "Perfeito, {first}! Já deixei confirmado. Te mando os detalhes por aqui 💙",
    "Show, {first}! Agendamento confirmado, te espero por lá 😊",
    "Combinado, {first}! Já reservei seu horário.",
  ];
  for (let i = 0; i < LEADS_PER_STAGE; i++) {
    const name = nextName();
    const first = name.split(" ")[0];
    const lead = await createLead(`demo-agendado-${i}`, name);
    const t0 = hoursAgo(6 + i * 4);
    const t1 = hoursAgo(5.9 + i * 4);
    const conv = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        status: "SCHEDULED",
        lastLeadMessageAt: t0,
        lastAiMessageAt: t1,
        lastMessageAt: t1,
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "INBOUND", sender: "LEAD", content: pick(scheduleDayTexts, i), status: "SENT", sentAt: t0 },
        { conversationId: conv.id, direction: "OUTBOUND", sender: "AI", content: pick(scheduleConfirms, i).replace("{first}", first!), status: "SENT", sentAt: t1 },
      ],
    });
    // Espalha os agendamentos pelos próximos dias úteis, em horários variados.
    const dayOffset = 1 + (i % 6);
    const hour = 9 + ((i * 2) % 8);
    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        conversationId: conv.id,
        leadId: lead.id,
        scheduledAt: daysFromNow(dayOffset, hour),
        status: "SCHEDULED",
      },
    });
  }

  // 4) FOLLOW-UP — sumiu no meio da conversa
  const followUpOpeners = [
    "Oi, ainda tenho interesse na lente de resina",
    "Oi, quero saber mais sobre o preenchimento",
    "Olá, vi a promoção e fiquei interessada",
    "Oi, pode me explicar como funciona a avaliação?",
  ];
  const followUpAiReplies = [
    "Que ótimo, {first}! Você prefere manhã ou tarde pra sua avaliação?",
    "Perfeito, {first}! Consigo já ver um horário, tudo bem?",
    "Show, {first}! Me conta um pouco mais pra eu te ajudar melhor.",
  ];
  const followUpPings = [
    "Oi! Ainda tem interesse em agendar sua avaliação? Consigo te ajudar a encontrar um horário 🙂",
    "Oi! Passando aqui pra saber se ainda posso te ajudar a marcar sua avaliação 😊",
  ];
  for (let i = 0; i < LEADS_PER_STAGE; i++) {
    const name = nextName();
    const first = name.split(" ")[0];
    const lead = await createLead(`demo-followup-${i}`, name);
    const t0 = hoursAgo(30 + i * 3);
    const t1 = hoursAgo(29.8 + i * 3);
    const t2 = hoursAgo(4 + i * 1.5);
    const conv = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        status: "FOLLOW_UP",
        lastLeadMessageAt: t0,
        lastAiMessageAt: t1,
        lastMessageAt: t2,
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "INBOUND", sender: "LEAD", content: pick(followUpOpeners, i), status: "SENT", sentAt: t0 },
        { conversationId: conv.id, direction: "OUTBOUND", sender: "AI", content: pick(followUpAiReplies, i).replace("{first}", first!), status: "SENT", sentAt: t1 },
        { conversationId: conv.id, direction: "OUTBOUND", sender: "AI", content: pick(followUpPings, i), status: "SENT", sentAt: t2 },
      ],
    });
    await prisma.followUpLog.create({
      data: { conversationId: conv.id, reason: "sumiu_na_conversa", triggeredAt: t2 },
    });
  }

  // 5) PERDIDO — recusou explicitamente
  const lostDeclines = [
    "Não vou conseguir agora, obrigada",
    "Vou deixar pra outra hora, valeu",
    "Não é bem o que eu procurava, mas obrigado",
    "Acabei fechando com outro lugar, desculpa",
  ];
  const lostReplies = [
    "Ah, entendi! Sem problemas, qualquer coisa é só chamar por aqui 🙂",
    "Tudo bem! Fico à disposição sempre que quiser 😊",
    "Sem problemas! Qualquer dúvida é só me chamar.",
  ];
  for (let i = 0; i < LEADS_PER_STAGE; i++) {
    const name = nextName();
    const lead = await createLead(`demo-perdido-${i}`, name);
    const t0 = hoursAgo(72 + i * 6);
    const t1 = hoursAgo(71.9 + i * 6);
    const conv = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        leadId: lead.id,
        status: "LOST",
        lastLeadMessageAt: t0,
        lastAiMessageAt: t1,
        lastMessageAt: t1,
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "INBOUND", sender: "LEAD", content: pick(lostDeclines, i), status: "SENT", sentAt: t0 },
        { conversationId: conv.id, direction: "OUTBOUND", sender: "AI", content: pick(lostReplies, i), status: "SENT", sentAt: t1 },
      ],
    });
  }

  const total = LEADS_PER_STAGE * 5;
  console.log(`Clínica demo criada: ${clinic.name} (id: ${clinic.id})`);
  console.log(`${total} conversas criadas — ${LEADS_PER_STAGE} em cada um dos 5 estágios do pipeline.`);
  console.log(`\nPara remover tudo depois (apaga em cascata leads/conversas/mensagens/agendamentos):`);
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
