import { google } from "googleapis";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { SAO_PAULO_UTC_OFFSET_HOURS } from "@/lib/timezone";

// Janela de funcionamento em horário de Brasília — usada só pra filtrar
// quais slots de 1h checkAvailability oferece (ver loop abaixo). Derivada
// do mesmo offset fixo usado em src/lib/timezone.ts (Brasília não tem mais
// horário de verão desde 2019), em vez de números mágicos soltos — mais
// fácil de auditar contra o bug real que motivou essa checagem existir
// (agendamentos genuinamente livres rejeitados por conta de erro de
// conversão de fuso horário, ver comentário grande em timezone.ts).
const BUSINESS_HOURS_START_LOCAL = 9; // 9h de Brasília
const BUSINESS_HOURS_END_LOCAL = 18; // 18h de Brasília
const BUSINESS_HOURS_START_UTC = BUSINESS_HOURS_START_LOCAL + SAO_PAULO_UTC_OFFSET_HOURS;
const BUSINESS_HOURS_END_UTC = BUSINESS_HOURS_END_LOCAL + SAO_PAULO_UTC_OFFSET_HOURS;

// Integração com Google Calendar via OAuth oficial, por clínica.
// Nunca armazenamos senha — apenas access/refresh token, criptografados.

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenciais OAuth do Google não configuradas.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleOAuthUrl(state: string): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token mesmo em reconexões
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeGoogleCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google não retornou refresh_token. Revogue o acesso anterior e reconecte com prompt=consent."
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    email: data.email ?? "",
  };
}

// Revoga o acesso OAuth ativo e remove a conexão local — usado tanto pra
// resetar contas de teste (Plano Piloto 21D) quanto pra quando a clínica
// desiste no meio do teste. Revogar do lado do Google é best-effort: se
// falhar (token já revogado, rede fora), ainda assim removemos localmente
// pra não deixar o card preso em "Conectado" sem o acesso real funcionar.
export async function disconnectGoogleCalendar(clinicId: string): Promise<void> {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { clinicId } });
  if (!account) return;

  try {
    const client = oauthClient();
    await client.revokeToken(decryptToken(account.refreshTokenEnc));
  } catch (err) {
    console.error("[vexo] Falha ao revogar token do Google Calendar:", err);
  }

  await prisma.googleCalendarAccount.delete({ where: { clinicId } });
}

// Exportado pra src/lib/google-calendar-sync.ts reaproveitar o mesmo
// client autenticado (com renovação automática de access token) em vez de
// duplicar essa lógica.
export async function clientForClinic(clinicId: string) {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { clinicId } });
  if (!account) throw new Error("Clínica sem Google Calendar conectado.");

  const client = oauthClient();
  client.setCredentials({
    access_token: decryptToken(account.accessTokenEnc),
    refresh_token: decryptToken(account.refreshTokenEnc),
    expiry_date: account.tokenExpiresAt?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    // A lib renova automaticamente o access token quando expira; persistimos
    // o novo valor para reaproveitar em execuções futuras.
    if (tokens.access_token) {
      await prisma.googleCalendarAccount.update({
        where: { clinicId },
        data: {
          accessTokenEnc: encryptToken(tokens.access_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });
    }
  });

  return { client, calendarId: account.calendarId };
}

// Diagnóstico: expõe, sem nenhuma interpretação/filtro do VEXO, os
// períodos "ocupados" crus que o Google devolveu pra uma janela, mais o
// e-mail e o ID do calendário efetivamente consultados. Motivado por um
// relato em produção: schedule_appointment rejeitou um horário numa
// agenda "de teste completamente vazia", sugerindo (mas não provando)
// bug na lógica de checkAvailability. Suspeita mais provável, olhando o
// resto do código: não existe seletor de calendário em lugar nenhum da
// interface — GoogleCalendarAccount.calendarId sempre usa o default
// "primary" (ver schema.prisma), então o VEXO sempre lê o calendário
// PRINCIPAL da conta Google autorizada. Se essa "agenda de teste" foi
// conectada com uma conta Google pessoal/real (em vez de uma conta
// dedicada só pra isso), "primary" aponta pro calendário de verdade
// dessa pessoa — que pode ter compromissos reais sem nenhuma relação com
// o VEXO. Essa função devolve o dado cru (googleAccountEmail +
// calendarId + os períodos ocupados exatos) pra confirmar isso com
// certeza, em vez de supor.
export async function getRawBusyPeriods(
  clinicId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ googleAccountEmail: string; calendarId: string; busy: { start?: string | null; end?: string | null }[] }> {
  const account = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { clinicId } });
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });
  const { data } = await calendar.freebusy.query({
    requestBody: { timeMin: dateFrom, timeMax: dateTo, items: [{ id: calendarId }] },
  });
  return {
    googleAccountEmail: account.googleAccountEmail,
    calendarId,
    busy: data.calendars?.[calendarId]?.busy ?? [],
  };
}

export async function checkAvailability(
  clinicId: string,
  dateFrom: string,
  dateTo: string
): Promise<string[]> {
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateFrom,
      timeMax: dateTo,
      items: [{ id: calendarId }],
    },
  });

  const busy = data.calendars?.[calendarId]?.busy ?? [];

  // Gera slots de 1h dentro da janela de trabalho (09h-18h) que não colidem
  // com os períodos ocupados. Janela de trabalho ajustável futuramente por clínica.
  const slots: string[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);

  for (
    let cursor = new Date(start);
    cursor < end;
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
  ) {
    const hour = cursor.getUTCHours();
    if (hour < BUSINESS_HOURS_START_UTC || hour > BUSINESS_HOURS_END_UTC) continue;

    const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
    const overlaps = busy.some((b) => {
      if (!b.start || !b.end) return false;
      return cursor < new Date(b.end) && slotEnd > new Date(b.start);
    });
    if (!overlaps) slots.push(cursor.toISOString());
  }

  return slots.slice(0, 10);
}

export async function createCalendarEvent(
  clinicId: string,
  startTimeIso: string,
  summary: string,
  location?: string
): Promise<string> {
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const start = new Date(startTimeIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      location,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  if (!data.id) throw new Error("Google Calendar não retornou ID do evento criado.");
  return data.id;
}

// Move um evento JÁ EXISTENTE pra um novo horário (remarcação), em vez de
// criar outro — usado por confirmAppointment (conversation-pipeline.ts)
// quando a conversa já tem um Appointment ativo e o lead pede outro
// horário. Bug real em produção: sem essa distinção entre "primeira
// confirmação" e "remarcação", cada chamada bem-sucedida de
// schedule_appointment criava um Appointment + evento novo no Google
// Calendar, duplicando o compromisso na agenda real da clínica.
export async function updateCalendarEvent(clinicId: string, eventId: string, startTimeIso: string): Promise<void> {
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const start = new Date(startTimeIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
}
