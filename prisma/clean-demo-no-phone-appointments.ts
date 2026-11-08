import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { DEMO_CLINIC_ID, assertDemoClinic, isNoPhoneTestAppointment, selectNoPhoneAppointmentsToClean } from "./clean-demo-no-phone-appointments-logic";

const prisma = new PrismaClient();

// Script ÚNICO (não é rota nem botão da interface, não vira comando
// permanente no package.json) pra limpar os agendamentos de TESTE da
// Clínica Demo VEXO cujo Lead não tem telefone cadastrado — pedido
// explícito do dono, parte do ajuste visual do Painel (a lista
// "Agendamentos" da Demo estava poluída com esses agendamentos).
//
// SEGURANÇA, nesta ordem (mesmo padrão de clean-no-photo-demo-data.ts/
// seed-reactivation-return-demo.ts):
//   1. Restrito à Clínica Demo VEXO (DEMO_CLINIC_ID) — qualquer outro
//      --clinic= é recusado na hora, antes de ler ou apagar qualquer linha.
//   2. NUNCA toca em agendamento ligado a um card FIXO da Reativação
//      (ReactivationShowcaseBackup.appointmentId) — alguns desses leads
//      têm telefone removido DE PROPÓSITO pra forçar o canal Instagram na
//      demonstração (ver originalLeadPhone, schema.prisma); "sem
//      telefone" neles é intencional, não lixo de teste.
//   3. NUNCA toca no agendamento criado por
//      prisma/seed-reactivation-return-demo.ts (ReactivationReturnDemoBackup.
//      createdAppointmentId) — esse é desfeito à parte, com o --restore
//      daquele script.
//   4. SEM NENHUMA flag (ou --check) = modo relatório (dry run), só
//      leitura: lista todos os candidatos (nome/@, telefone do lead
//      confirmado vazio, data do agendamento, status) e quantos ficam de
//      fora pelas exclusões acima.
//   5. --apply = apaga de verdade — grava um backup JSON ANTES de apagar
//      (Appointment completo + ReminderLog/ReactivationCardSlot/
//      NoShowCardSlot cascateados, pra --restore poder recriar tudo
//      igual). Tudo numa transação que RECONFERE o conjunto de ids no
//      banco antes de deletar (aborta se mudou desde o relatório).
//   6. --restore=<caminho-do-backup.json> = desfaz exatamente o que
//      --apply apagou — recria cada Appointment (com o MESMO id) e os
//      ReminderLog/ReactivationCardSlot/NoShowCardSlot que foram
//      cascateados junto. Só funciona com o arquivo de backup gerado por
//      este mesmo script.
//
// Uso:
//   npx tsx prisma/clean-demo-no-phone-appointments.ts                              # relatório só, não apaga nada
//   npx tsx prisma/clean-demo-no-phone-appointments.ts --check                      # mesmo, explícito
//   npx tsx prisma/clean-demo-no-phone-appointments.ts --apply                      # apaga de verdade, grava backup
//   npx tsx prisma/clean-demo-no-phone-appointments.ts --restore=<caminho>.json     # desfaz

type AppointmentRow = Record<string, unknown> & { id: string };

function leadLabel(lead: { name: string | null; igUsername: string | null } | null): string {
  return lead?.name ?? (lead?.igUsername ? `@${lead.igUsername}` : "(sem nome)");
}

// Datas voltam de JSON.parse como string — reidrata qualquer string em
// formato ISO-8601 completo de volta pra Date antes de passar pro
// Prisma.create (que exige um objeto Date de verdade pra coluna DateTime,
// nunca string).
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function reviveDates(_key: string, value: unknown): unknown {
  return typeof value === "string" && ISO_DATETIME_RE.test(value) ? new Date(value) : value;
}

type Backup = {
  clinicId: string;
  generatedAt: string;
  appointments: AppointmentRow[];
  reminderLogs: AppointmentRow[];
  reactivationCardSlots: AppointmentRow[];
  noShowCardSlots: AppointmentRow[];
};

async function runCheck(clinicId: string): Promise<void> {
  const [appointments, pinned, returnDemoBackup] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId },
      select: { id: true, leadId: true, scheduledAt: true, status: true, lead: { select: { name: true, igUsername: true, phone: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.reactivationShowcaseBackup.findMany({ where: { clinicId }, select: { appointmentId: true } }),
    prisma.reactivationReturnDemoBackup.findMany({ where: { clinicId, createdAppointmentId: { not: null } }, select: { createdAppointmentId: true } }),
  ]);

  const excludedIds = new Set<string>([
    ...pinned.map((p) => p.appointmentId),
    ...returnDemoBackup.map((r) => r.createdAppointmentId!).filter(Boolean),
  ]);

  const rows = appointments.map((a) => ({ id: a.id, leadId: a.leadId, leadPhone: a.lead?.phone ?? null }));
  const candidates = selectNoPhoneAppointmentsToClean(rows, excludedIds);
  const candidateIds = new Set(candidates.map((c) => c.id));

  const excludedButNoPhone = appointments.filter((a) => isNoPhoneTestAppointment({ id: a.id, leadId: a.leadId, leadPhone: a.lead?.phone ?? null }) && !candidateIds.has(a.id));

  console.log(`--- Agendamentos sem telefone (candidatos à limpeza) ---`);
  console.log(`Total: ${candidates.length} de ${appointments.length} agendamentos da clínica.\n`);

  for (const a of appointments.filter((a) => candidateIds.has(a.id))) {
    console.log(`  ${leadLabel(a.lead)} — ${a.scheduledAt.toISOString().slice(0, 10)} — status=${a.status} — id=${a.id}`);
  }

  if (excludedButNoPhone.length > 0) {
    console.log(`\nFicam de FORA mesmo sem telefone (cards fixos da Reativação, ou o agendamento do reactivation-return-demo) — ${excludedButNoPhone.length}:`);
    for (const a of excludedButNoPhone) {
      console.log(`  ${leadLabel(a.lead)} — ${a.scheduledAt.toISOString().slice(0, 10)} — id=${a.id}`);
    }
  }

  if (candidates.length === 0) {
    console.log("\nNada a apagar.");
    return;
  }

  console.log(`\nPra apagar de verdade (grava backup antes):\n  npx tsx prisma/clean-demo-no-phone-appointments.ts --apply`);
}

async function runApply(clinicId: string): Promise<void> {
  const [appointments, pinned, returnDemoBackup] = await Promise.all([
    prisma.appointment.findMany({ where: { clinicId }, select: { id: true, leadId: true, lead: { select: { phone: true } } } }),
    prisma.reactivationShowcaseBackup.findMany({ where: { clinicId }, select: { appointmentId: true } }),
    prisma.reactivationReturnDemoBackup.findMany({ where: { clinicId, createdAppointmentId: { not: null } }, select: { createdAppointmentId: true } }),
  ]);
  const excludedIds = new Set<string>([
    ...pinned.map((p) => p.appointmentId),
    ...returnDemoBackup.map((r) => r.createdAppointmentId!).filter(Boolean),
  ]);
  const rows = appointments.map((a) => ({ id: a.id, leadId: a.leadId, leadPhone: a.lead?.phone ?? null }));
  const idsToDelete = selectNoPhoneAppointmentsToClean(rows, excludedIds).map((a) => a.id);

  if (idsToDelete.length === 0) {
    console.log("Nada a apagar (rode sem flag, ou com --check, pra ver o relatório).");
    return;
  }

  console.log(`Apagando ${idsToDelete.length} agendamento(s) sem telefone...\n`);

  // ---- Backup JSON ANTES de apagar qualquer coisa ----
  const [appointmentRows, reminderLogRows, reactivationCardSlotRows, noShowCardSlotRows] = await Promise.all([
    prisma.appointment.findMany({ where: { id: { in: idsToDelete } } }),
    prisma.reminderLog.findMany({ where: { appointmentId: { in: idsToDelete } } }),
    prisma.reactivationCardSlot.findMany({ where: { appointmentId: { in: idsToDelete } } }),
    prisma.noShowCardSlot.findMany({ where: { appointmentId: { in: idsToDelete } } }),
  ]);

  const backup: Backup = {
    clinicId,
    generatedAt: new Date().toISOString(),
    appointments: appointmentRows as AppointmentRow[],
    reminderLogs: reminderLogRows as AppointmentRow[],
    reactivationCardSlots: reactivationCardSlotRows as AppointmentRow[],
    noShowCardSlots: noShowCardSlotRows as AppointmentRow[],
  };
  const backupPath = path.join(process.cwd(), `clean-demo-no-phone-appointments-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup gravado em: ${backupPath}`);

  // ---- Exclusão, numa transação que reconfere o conjunto antes de apagar ----
  const result = await prisma.$transaction(async (tx) => {
    const recheckAppointments = await tx.appointment.findMany({ where: { clinicId }, select: { id: true, leadId: true, lead: { select: { phone: true } } } });
    const recheckRows = recheckAppointments.map((a) => ({ id: a.id, leadId: a.leadId, leadPhone: a.lead?.phone ?? null }));
    const recheckIds = new Set(selectNoPhoneAppointmentsToClean(recheckRows, excludedIds).map((a) => a.id));
    const sameSet = recheckIds.size === idsToDelete.length && idsToDelete.every((id) => recheckIds.has(id));
    if (!sameSet) {
      throw new Error(
        `Abortado: o conjunto de agendamentos sem telefone mudou entre o relatório (${idsToDelete.length}) e a exclusão (${recheckIds.size}). Rode de novo sem --apply pra ver o estado atual.`
      );
    }

    const [reminderLogCount, reactivationCardSlotCount, noShowCardSlotCount] = await Promise.all([
      tx.reminderLog.count({ where: { appointmentId: { in: idsToDelete } } }),
      tx.reactivationCardSlot.count({ where: { appointmentId: { in: idsToDelete } } }),
      tx.noShowCardSlot.count({ where: { appointmentId: { in: idsToDelete } } }),
    ]);
    const { count: appointmentsDeleted } = await tx.appointment.deleteMany({ where: { id: { in: idsToDelete } } });

    return { appointmentsDeleted, reminderLogCount, reactivationCardSlotCount, noShowCardSlotCount };
  });

  console.log("\n--- Apagado ---");
  console.log(`Appointment: ${result.appointmentsDeleted}`);
  console.log(`ReminderLog: ${result.reminderLogCount}`);
  console.log(`ReactivationCardSlot: ${result.reactivationCardSlotCount}`);
  console.log(`NoShowCardSlot: ${result.noShowCardSlotCount}`);
  console.log(`\nPra desfazer:\n  npx tsx prisma/clean-demo-no-phone-appointments.ts --restore=${backupPath}`);
}

async function runRestore(clinicId: string, backupPath: string): Promise<void> {
  if (!fs.existsSync(backupPath)) {
    console.log(`Arquivo de backup não encontrado: ${backupPath}`);
    return;
  }
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"), reviveDates) as Backup;
  if (backup.clinicId !== clinicId) {
    throw new Error(`Backup é de outra clínica (${backup.clinicId}) — recusado por segurança.`);
  }

  console.log(`Restaurando ${backup.appointments.length} agendamento(s) de ${backupPath}...\n`);

  await prisma.$transaction(async (tx) => {
    for (const appt of backup.appointments) {
      await tx.appointment.create({ data: appt as never });
    }
    for (const log of backup.reminderLogs) {
      await tx.reminderLog.create({ data: log as never });
    }
    for (const slot of backup.reactivationCardSlots) {
      await tx.reactivationCardSlot.create({ data: slot as never });
    }
    for (const slot of backup.noShowCardSlots) {
      await tx.noShowCardSlot.create({ data: slot as never });
    }
  });

  console.log(`Restaurado: ${backup.appointments.length} Appointment, ${backup.reminderLogs.length} ReminderLog, ${backup.reactivationCardSlots.length} ReactivationCardSlot, ${backup.noShowCardSlots.length} NoShowCardSlot.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const restoreArg = args.find((a) => a.startsWith("--restore="));
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const clinicId = clinicArg ? clinicArg.slice("--clinic=".length) : DEMO_CLINIC_ID;

  // Recusa ANTES de qualquer leitura/escrita — nenhuma query roda pra
  // outra clínica, nem a de relatório.
  assertDemoClinic(clinicId);

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Nenhuma clínica encontrada com id "${clinicId}".`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})`);

  if (restoreArg) {
    const backupPath = path.isAbsolute(restoreArg.slice("--restore=".length))
      ? restoreArg.slice("--restore=".length)
      : path.join(process.cwd(), restoreArg.slice("--restore=".length));
    return runRestore(clinicId, backupPath);
  }
  if (apply) return runApply(clinicId);
  return runCheck(clinicId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
