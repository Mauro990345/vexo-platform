import { google, calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { clientForClinic } from "@/lib/google-calendar";

// Sincronização de LEITURA (Google -> VEXO) — complementa createCalendarEvent
// em google-calendar.ts, que só escreve. Roda por polling (cron no worker,
// a cada 5 minutos) usando o syncToken incremental do Google: a primeira
// chamada sem token traz tudo + devolve um nextSyncToken; toda chamada
// seguinte com esse token só traz o que mudou desde então (evento novo,
// editado ou status "cancelled" pros excluídos) — tão eficiente quanto um
// webhook, sem precisar de canal público, renovação de inscrição nem
// endpoint novo.
//
// Casamento evento <-> Appointment é sempre por googleEventId. Agendamentos
// criados pela IA (conversation-pipeline.ts) já salvam esse id no momento
// da criação, então o sync só atualiza esses (nunca duplica); eventos que
// aparecem sem um Appointment correspondente são criados pela própria
// clínica direto no Google Calendar dela — viram Appointment sem
// Lead/Conversation (ver schema).
//
// Fora do escopo da v1 (combinado): eventos recorrentes (instâncias com
// recurringEventId são ignoradas) e eventos de dia inteiro (sem
// start.dateTime, só start.date).
//
// Limitação aceita: existe uma janela estreita (a chamada a createCalendarEvent
// e a criação do Appointment com o googleEventId não são atômicas — ver
// confirmAppointment em conversation-pipeline.ts) em que um sync poderia,
// em tese, ver o evento no Google antes do Appointment existir no Postgres
// e importá-lo como manual. Na prática o intervalo é de poucas centenas de
// milissegundos contra um polling de 5 em 5 minutos — probabilidade
// desprezível, não vale a complexidade de um lock pra evitar.

const CALENDAR_API_VERSION = "v3";

export type SyncResult = { created: number; updated: number; cancelled: number };

export async function syncClinicCalendar(clinicId: string): Promise<SyncResult> {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { clinicId } });
  if (!account) return { created: 0, updated: 0, cancelled: 0 };

  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: CALENDAR_API_VERSION, auth: client });

  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  try {
    do {
      const { data } = await calendar.events.list({
        calendarId,
        syncToken: account.syncToken ?? undefined,
        pageToken,
        singleEvents: true,
      });
      events.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
      if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    } while (pageToken);
  } catch (err) {
    const status = (err as { code?: number; response?: { status?: number } })?.code
      ?? (err as { response?: { status?: number } })?.response?.status;
    if (status === 410) {
      // syncToken expirado/inválido (calendário sem sync há muito tempo,
      // ou revogado do lado do Google) — reseta pra refazer do zero na
      // próxima rodada, em vez de ficar preso num erro permanente.
      await prisma.googleCalendarAccount.update({ where: { clinicId }, data: { syncToken: null } });
      return { created: 0, updated: 0, cancelled: 0 };
    }
    throw err;
  }

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  for (const event of events) {
    if (!event.id) continue;
    if (event.recurringEventId) continue; // instância de série recorrente — fora do escopo da v1

    if (event.status === "cancelled") {
      const appt = await prisma.appointment.findFirst({ where: { clinicId, googleEventId: event.id } });
      if (appt && appt.status !== "CANCELLED") {
        await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
        cancelled++;
      }
      continue;
    }

    if (!event.start?.dateTime) continue; // evento de dia inteiro (só "date", sem hora) — fora do escopo da v1

    const scheduledAt = new Date(event.start.dateTime);
    const existing = await prisma.appointment.findFirst({ where: { clinicId, googleEventId: event.id } });

    if (existing) {
      const data: { scheduledAt?: Date; manualTitle?: string | null } = {};
      if (existing.scheduledAt.getTime() !== scheduledAt.getTime()) data.scheduledAt = scheduledAt;
      // Só renomeia se for um agendamento manual — nunca sobrescreve o
      // título de um agendamento com Lead (esse não usa manualTitle pra
      // exibição, usa o nome do Lead).
      if (!existing.leadId && existing.manualTitle !== (event.summary ?? null)) {
        data.manualTitle = event.summary ?? null;
      }
      if (Object.keys(data).length > 0) {
        await prisma.appointment.update({ where: { id: existing.id }, data });
        updated++;
      }
      continue;
    }

    // Evento novo que o VEXO não conhece — criado pela clínica direto no
    // Google Calendar dela, paciente conhecido sem conversa no Instagram.
    await prisma.appointment.create({
      data: {
        clinicId,
        googleEventId: event.id,
        scheduledAt,
        manualTitle: event.summary ?? "Agendamento",
        syncedFromGoogle: true,
        status: "SCHEDULED",
      },
    });
    created++;
  }

  if (nextSyncToken) {
    await prisma.googleCalendarAccount.update({ where: { clinicId }, data: { syncToken: nextSyncToken } });
  }

  return { created, updated, cancelled };
}

export async function syncAllGoogleCalendars(): Promise<SyncResult & { clinics: number; failed: number }> {
  const accounts = await prisma.googleCalendarAccount.findMany({ select: { clinicId: true } });

  const totals = { created: 0, updated: 0, cancelled: 0, clinics: accounts.length, failed: 0 };

  for (const { clinicId } of accounts) {
    try {
      const result = await syncClinicCalendar(clinicId);
      totals.created += result.created;
      totals.updated += result.updated;
      totals.cancelled += result.cancelled;
    } catch (err) {
      totals.failed++;
      console.error(`[vexo] Falha ao sincronizar Google Calendar (clinicId=${clinicId}):`, err);
    }
  }

  return totals;
}
