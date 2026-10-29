import { PrismaClient } from "@prisma/client";
import { getReactivationCards } from "../src/lib/reactivation";
import { DEMO_CLINIC_ID } from "./clean-no-photo-demo-data-logic";

const prisma = new PrismaClient();

// Script de DIAGNÓSTICO, 100% leitura — nenhum INSERT/UPDATE/DELETE.
// Investiga por que os 3 cards que prisma:seed:reactivation-showcase
// marcou em produção não aparecem no Painel, e por que a lista de
// Agendamentos continua mostrando as datas ORIGINAIS (sugestão forte de
// que o scheduledAt foi revertido por algo depois do script rodar — ver
// hipótese abaixo, checada diretamente).
//
// Uso (Console do Railway, serviço vexo-platform):
//   npx tsx prisma/diagnose-showcase-disappearance.ts

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return "(DATABASE_URL não definida)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "(porta padrão)"}${u.pathname}`;
  } catch {
    return "(DATABASE_URL presente, não foi possível parsear)";
  }
}

async function main(): Promise<void> {
  console.log("=== 0) Ambiente/conexão (descarta banco errado) ===");
  console.log(`DATABASE_URL (host/db, sem credenciais): ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log(`RAILWAY_ENVIRONMENT_NAME: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? "(não definida)"}`);
  console.log(`RAILWAY_SERVICE_NAME: ${process.env.RAILWAY_SERVICE_NAME ?? "(não definida)"}`);
  console.log(`RAILWAY_PROJECT_NAME: ${process.env.RAILWAY_PROJECT_NAME ?? "(não definida)"}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV ?? "(não definida)"}`);
  console.log(
    `Compare o DATABASE_URL acima com a variável DATABASE_URL do serviço vexo-platform (aba Variables, Railway) — se forem hosts/bancos DIFERENTES, o Console está escrevendo num banco que o app não lê.\n`
  );

  const now = new Date();
  console.log("=== 1) Relógio/fuso do servidor ===");
  console.log(`new Date() agora: ${now.toISOString()} (UTC) / ${now.toString()} (timezone do processo)`);
  console.log(`Intl timeZone resolvido: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`process.env.TZ: ${process.env.TZ ?? "(não definida)"}\n`);

  const clinic = await prisma.clinic.findUnique({ where: { id: DEMO_CLINIC_ID }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Clínica Demo VEXO (id "${DEMO_CLINIC_ID}") não encontrada neste banco — provavelmente confirma o problema do item 0 (banco errado).`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})\n`);

  console.log("=== 2) Google Calendar conectado? (hipótese: sync reverte scheduledAt) ===");
  const gcal = await prisma.googleCalendarAccount.findUnique({ where: { clinicId: DEMO_CLINIC_ID } });
  if (gcal) {
    console.log(`CONECTADO — conta: ${gcal.googleAccountEmail}, calendarId: ${gcal.calendarId}, syncToken: ${gcal.syncToken ? "presente" : "null (nunca sincronizou ou expirou)"}`);
    console.log(
      "google-calendar-sync.ts roda a cada 5 min (worker) e, pra todo Appointment com googleEventId, SOBRESCREVE scheduledAt de volta pro horário do evento no Google sempre que detecta diferença — isso vale TAMBÉM pra agendamentos criados pela IA (eles já nascem com googleEventId), não só os importados manualmente.\n"
    );
  } else {
    console.log("NÃO conectado — essa hipótese fica descartada pra esta clínica.\n");
  }

  console.log("=== 3) Os 3 agendamentos (buscados por nome do lead) ===\n");
  const names = ["Mauro Silva", "Leonardo da Silva", "Doca"];
  const leads = await prisma.lead.findMany({
    where: { clinicId: DEMO_CLINIC_ID, name: { in: names } },
    select: { id: true, name: true, phone: true, igUsername: true },
  });

  for (const lead of leads) {
    const appts = await prisma.appointment.findMany({
      where: { leadId: lead.id },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        returnPeriodDays: true,
        returnPeriodNone: true,
        googleEventId: true,
        syncedFromGoogle: true,
        conversationId: true,
      },
      orderBy: { scheduledAt: "desc" },
    });
    console.log(`--- ${lead.name} (leadId=${lead.id}, telefone=${lead.phone ? "sim" : "não"}) ---`);
    for (const a of appts) {
      console.log(
        `  appointmentId=${a.id} scheduledAt=${a.scheduledAt.toISOString()} status=${a.status} returnPeriodDays=${a.returnPeriodDays} returnPeriodNone=${a.returnPeriodNone} conversationId=${a.conversationId ? "sim" : "não"} googleEventId=${a.googleEventId ?? "(nenhum)"} syncedFromGoogle=${a.syncedFromGoogle}`
      );
      const slots = await prisma.reactivationCardSlot.findMany({ where: { appointmentId: a.id } });
      for (const s of slots) {
        console.log(`    ReactivationCardSlot: thresholdDays=${s.thresholdDays} slot=${s.slot} sentAt=${s.sentAt ? s.sentAt.toISOString() : "null (pendente)"}`);
      }
      if (slots.length === 0) console.log("    (nenhum ReactivationCardSlot gravado pra este agendamento)");
    }
    console.log("");
  }
  if (leads.length < names.length) {
    const found = leads.map((l) => l.name);
    console.log(`⚠️  Lead(s) não encontrado(s) pelo nome exato: ${names.filter((n) => !found.includes(n)).join(", ")}\n`);
  }

  console.log("=== 4) getReactivationCards(clinicId, now) — a MESMA função que o Painel chama ===\n");
  const cards = await getReactivationCards(DEMO_CLINIC_ID, now);
  console.log(`Devolveu ${cards.length} card(s) agora (${now.toISOString()}).`);
  for (const c of cards) {
    console.log(`  - ${c.name} — ${c.channel} — prazo ${c.thresholdDays}d — completionDate=${c.completionDate.toISOString()} — sentAt=${c.sentAt ? c.sentAt.toISOString() : "null"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
